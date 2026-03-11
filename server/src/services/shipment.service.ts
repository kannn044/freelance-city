import { prisma } from "../lib/prisma";
import { SHIP_CONFIG } from "../../../shared/gameConfig";
import { getTravelTimeSeconds, CITY_KEYS } from "../../../shared/mapData";
import { createNotification } from "./notification.service";

let cronStarted = false;

/** Initialize public ships for all routes on server startup */
export async function initPublicShips() {
    const existingPublicShips = await prisma.ship.count({
        where: { type: "PUBLIC", status: "DOCKED" },
    });

    // Only init if no docked public ships exist
    if (existingPublicShips > 0) return;

    const now = new Date();
    const departInterval = SHIP_CONFIG.public.departureIntervalMin * 60 * 1000;
    const firstDepartAt = new Date(Math.ceil(now.getTime() / departInterval) * departInterval);

    const ships: Array<{
        type: "PUBLIC";
        origin_city: string;
        dest_city: string;
        status: "DOCKED";
        capacity: number;
        departs_at: Date;
    }> = [];

    for (const origin of CITY_KEYS) {
        for (const dest of CITY_KEYS) {
            if (origin === dest) continue;
            const travelTime = getTravelTimeSeconds(origin, dest);
            if (travelTime <= 0) continue;

            ships.push({
                type: "PUBLIC",
                origin_city: origin,
                dest_city: dest,
                status: "DOCKED",
                capacity: SHIP_CONFIG.public.capacity,
                departs_at: firstDepartAt,
            });
        }
    }

    if (ships.length > 0) {
        await prisma.ship.createMany({ data: ships });
        console.log(`[ShipCron] Initialized ${ships.length} public ships`);
    }
}

/** Depart public ships that are past their schedule */
async function departPublicShips() {
    const now = new Date();

    const readyShips = await prisma.ship.findMany({
        where: {
            type: "PUBLIC",
            status: "DOCKED",
            departs_at: { lte: now },
        },
        include: { cargo: { include: { order: true } } },
    });

    let departedCount = 0;
    let skippedCount = 0;

    for (const ship of readyShips) {
        const nextDepart = new Date(now.getTime() + SHIP_CONFIG.public.departureIntervalMin * 60 * 1000);

        // Skip ships with no cargo — just reschedule to next interval
        if (ship.cargo.length === 0) {
            await prisma.ship.update({
                where: { id: ship.id },
                data: { departs_at: nextDepart },
            });
            skippedCount++;
            continue;
        }

        const travelTime = getTravelTimeSeconds(ship.origin_city, ship.dest_city);
        const arrivesAt = new Date(now.getTime() + travelTime * 1000);

        await prisma.$transaction(async (tx) => {
            // Depart the ship
            await tx.ship.update({
                where: { id: ship.id },
                data: {
                    status: "SAILING",
                    departed_at: now,
                    arrives_at: arrivesAt,
                },
            });

            // Notify buyers of cargo on this ship
            for (const sc of ship.cargo) {
                await tx.notification.create({
                    data: {
                        user_id: sc.order.buyer_id,
                        type: "SHIP_DEPARTED",
                        title: "Public ship departed",
                        body: `A public ship carrying your order #${sc.order_id} has departed. ETA: ${travelTime}s.`,
                        metadata: JSON.stringify({ orderId: sc.order_id, shipId: ship.id }),
                    },
                });
            }

            // Create replacement docked ship for the same route
            await tx.ship.create({
                data: {
                    type: "PUBLIC",
                    origin_city: ship.origin_city,
                    dest_city: ship.dest_city,
                    status: "DOCKED",
                    capacity: SHIP_CONFIG.public.capacity,
                    departs_at: nextDepart,
                },
            });
        });

        departedCount++;
    }

    if (departedCount > 0 || skippedCount > 0) {
        console.log(`[ShipCron] Departed ${departedCount} public ships, skipped ${skippedCount} empty ships (rescheduled)`);
    }
}

/** Arrive ships and settle orders */
async function arriveShips() {
    const now = new Date();

    const arrivedShips = await prisma.ship.findMany({
        where: {
            status: "SAILING",
            arrives_at: { lte: now },
            attacks: { none: { status: "PENDING" } },
        },
        include: {
            cargo: {
                include: {
                    order: {
                        include: {
                            buyer: true,
                            seller: true,
                        },
                    },
                },
            },
        },
    });

    for (const ship of arrivedShips) {
        await prisma.$transaction(async (tx) => {
            await tx.ship.update({
                where: { id: ship.id },
                data: { status: "ARRIVED" },
            });

            for (const sc of ship.cargo) {
                const order = sc.order;

                // Skip orders that were pirated
                if (order.status === "PIRATED") continue;
                if (order.status !== "SHIPPING") continue;

                // Settlement
                const sellerCity = await tx.cityState.findUnique({
                    where: { city_key: order.seller.city_key! },
                });
                const buyerCity = await tx.cityState.findUnique({
                    where: { city_key: order.buyer.city_key! },
                });

                const exportTaxBp = sellerCity?.export_tax_bp ?? 300;
                const importTaxBp = buyerCity?.import_tax_bp ?? 300;
                const exportTax = Math.floor(order.price * exportTaxBp / 10000);
                const importTax = Math.floor(order.price * importTaxBp / 10000);
                const sellerReceives = order.price - exportTax;
                const buyerPays = order.price + importTax;

                // Unlock buyer money and settle
                const refund = order.locked_amount - buyerPays;
                await tx.user.update({
                    where: { id: order.buyer_id },
                    data: {
                        locked_money: { decrement: order.locked_amount },
                        money: refund > 0 ? { increment: refund } : undefined,
                    },
                });

                // Pay seller
                await tx.user.update({
                    where: { id: order.seller_id },
                    data: { money: { increment: sellerReceives } },
                });

                // Tax to city treasuries
                if (sellerCity) {
                    await tx.cityState.update({
                        where: { city_key: sellerCity.city_key },
                        data: { treasury: { increment: exportTax } },
                    });
                }
                if (buyerCity) {
                    await tx.cityState.update({
                        where: { city_key: buyerCity.city_key },
                        data: { treasury: { increment: importTax } },
                    });
                }

                // Update order
                await tx.purchaseOrder.update({
                    where: { id: order.id },
                    data: {
                        status: "DELIVERED",
                        export_tax: exportTax,
                        import_tax: importTax,
                        settled_at: new Date(),
                    },
                });

                // Cargo box → AT_PORT
                await tx.cargoBox.update({
                    where: { id: order.cargo_box_id },
                    data: { status: "AT_PORT" },
                });

                // Notify buyer
                await tx.notification.create({
                    data: {
                        user_id: order.buyer_id,
                        type: "SHIP_ARRIVED",
                        title: "Cargo arrived at port!",
                        body: `Your order #${order.id} has arrived. Visit the port to claim it.`,
                        metadata: JSON.stringify({ orderId: order.id }),
                    },
                });

                // Notify seller
                await tx.notification.create({
                    data: {
                        user_id: order.seller_id,
                        type: "SETTLEMENT_COMPLETE",
                        title: "Payment received!",
                        body: `You received ${sellerReceives} credits for order #${order.id} (export tax: ${exportTax}).`,
                        metadata: JSON.stringify({ orderId: order.id, amount: sellerReceives }),
                    },
                });
            }
        });
    }

    if (arrivedShips.length > 0) {
        console.log(`[ShipCron] Settled ${arrivedShips.length} ships`);
    }
}

/** Auto-cancel expired purchase orders */
async function cancelExpiredOrders() {
    const now = new Date();

    const expiredOrders = await prisma.purchaseOrder.findMany({
        where: {
            status: "PENDING",
            expires_at: { lte: now },
        },
    });

    for (const order of expiredOrders) {
        await prisma.$transaction(async (tx) => {
            // Refund buyer
            await tx.user.update({
                where: { id: order.buyer_id },
                data: {
                    money: { increment: order.locked_amount },
                    locked_money: { decrement: order.locked_amount },
                },
            });

            // Update order
            await tx.purchaseOrder.update({
                where: { id: order.id },
                data: { status: "CANCELLED_TIMEOUT" },
            });

            // Re-list on marketplace
            await tx.marketListing.update({
                where: { id: order.listing_id },
                data: { status: "ACTIVE", buyer_id: null, sold_at: null },
            });

            // Re-list cargo box
            await tx.cargoBox.update({
                where: { id: order.cargo_box_id },
                data: { status: "LISTED" },
            });

            // Notify both
            await tx.notification.create({
                data: {
                    user_id: order.buyer_id,
                    type: "ORDER_CANCELLED_TIMEOUT",
                    title: "Order expired",
                    body: `Order #${order.id} was cancelled because the seller didn't ship in time. Your money has been refunded.`,
                    metadata: JSON.stringify({ orderId: order.id }),
                },
            });
            await tx.notification.create({
                data: {
                    user_id: order.seller_id,
                    type: "ORDER_CANCELLED_TIMEOUT",
                    title: "Order expired",
                    body: `Order #${order.id} expired because you didn't ship in time. The cargo is back on the marketplace.`,
                    metadata: JSON.stringify({ orderId: order.id }),
                },
            });
        });
    }

    if (expiredOrders.length > 0) {
        console.log(`[ShipCron] Cancelled ${expiredOrders.length} expired orders`);
    }
}

/** Start all shipment cron jobs */
export function startShipmentCrons() {
    if (cronStarted) return;
    cronStarted = true;

    // Ship arrival check — every 3 seconds
    setInterval(async () => {
        try { await arriveShips(); } catch (e) { console.error("[ShipCron] arriveShips error:", e); }
    }, 3000);

    // Public ship departure — every 30 seconds (checks departs_at)
    setInterval(async () => {
        try { await departPublicShips(); } catch (e) { console.error("[ShipCron] departPublicShips error:", e); }
    }, 30000);

    // Order timeout — every 30 seconds
    setInterval(async () => {
        try { await cancelExpiredOrders(); } catch (e) { console.error("[ShipCron] cancelExpiredOrders error:", e); }
    }, 30000);

    console.log("[ShipCron] Started shipment background jobs");
}
