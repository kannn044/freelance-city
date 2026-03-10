import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { SHIP_CONFIG } from "../../../shared/gameConfig";
import { createNotificationTx } from "../services/notification.service";

interface AuthRequest extends Request {
    userId?: number;
}

type RPSValue = "ROCK" | "PAPER" | "SCISSORS";

function resolveRPS(defenderSeq: RPSValue[], attackerSeq: RPSValue[]) {
    const minLen = Math.min(defenderSeq.length, attackerSeq.length);
    let attackerWins = 0, defenderWins = 0, draws = 0;
    const rounds: Array<{ defender: RPSValue | null; attacker: RPSValue | null; result: "W" | "L" | "D" }> = [];

    for (let i = 0; i < minLen; i++) {
        const d = defenderSeq[i], a = attackerSeq[i];
        if (d === a) {
            draws++;
            rounds.push({ defender: d, attacker: a, result: "D" });
        } else if (
            (d === "ROCK" && a === "SCISSORS") ||
            (d === "PAPER" && a === "ROCK") ||
            (d === "SCISSORS" && a === "PAPER")
        ) {
            defenderWins++;
            rounds.push({ defender: d, attacker: a, result: "L" });
        } else {
            attackerWins++;
            rounds.push({ defender: d, attacker: a, result: "W" });
        }
    }

    // Remaining defender slots = draws
    for (let i = minLen; i < defenderSeq.length; i++) {
        draws++;
        rounds.push({ defender: defenderSeq[i], attacker: null, result: "D" });
    }

    return { attackerWins, defenderWins, draws, rounds };
}

/** POST /game/pirate/attack */
export const launchPirateAttack = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { targetShipId, shipSize, rpsSequence } = req.body as {
            targetShipId: number;
            shipSize: string;
            rpsSequence: string[];
        };

        if (!["S", "M", "L"].includes(shipSize)) {
            res.status(400).json({ error: "Invalid ship size" });
            return;
        }

        const sizeKey = shipSize as keyof typeof SHIP_CONFIG.pirate.sizes;
        const pirateConfig = SHIP_CONFIG.pirate.sizes[sizeKey];

        if (!rpsSequence || rpsSequence.length !== pirateConfig.rpsSlots) {
            res.status(400).json({ error: `RPS sequence must have ${pirateConfig.rpsSlots} values` });
            return;
        }

        const validRPS = ["ROCK", "PAPER", "SCISSORS"];
        if (!rpsSequence.every((v) => validRPS.includes(v))) {
            res.status(400).json({ error: "Invalid RPS values" });
            return;
        }

        const result = await prisma.$transaction(async (tx) => {
            // Check cooldown
            const cooldown = await tx.pirateCooldown.findUnique({ where: { user_id: userId } });
            if (cooldown) {
                const cooldownEnd = new Date(cooldown.last_attack_at.getTime() + SHIP_CONFIG.pirate.cooldownMinutes * 60 * 1000);
                if (new Date() < cooldownEnd) {
                    return { error: `Pirate cooldown active. Try again after ${cooldownEnd.toISOString()}` };
                }
            }

            // Validate target ship
            const targetShip = await tx.ship.findUnique({
                where: { id: targetShipId },
                include: {
                    cargo: { include: { order: { include: { cargo_box: { include: { items: { include: { item: true } } } } } } } },
                },
            });

            if (!targetShip) return { error: "Target ship not found" };
            if (targetShip.status !== "SAILING") return { error: "Ship is not sailing" };
            if (targetShip.type !== "PRIVATE") return { error: "Cannot attack public ships" };
            if (targetShip.is_bot_ship) return { error: "Cannot attack this ship" };
            if (targetShip.owner_id === userId) return { error: "Cannot attack your own ship" };

            // Check if any cargo belongs to attacker as buyer
            for (const sc of targetShip.cargo) {
                if (sc.order.buyer_id === userId) {
                    return { error: "Cannot attack a ship carrying your own order" };
                }
            }

            // Check for pending attacks on this ship
            const pendingAttack = await tx.pirateAttack.findFirst({
                where: { target_ship_id: targetShipId, status: "PENDING" },
            });
            if (pendingAttack) return { error: "Ship is already under attack" };

            // Check fuel + credits
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            if (user.money < pirateConfig.creditCost) {
                return { error: `Need ${pirateConfig.creditCost} credits` };
            }

            const fuelItem = await tx.item.findUnique({ where: { name: "Fuel Cell" } });
            if (!fuelItem) return { error: "Fuel Cell item not found" };

            const fuelSlots = await tx.inventorySlot.findMany({
                where: { user_id: userId, item_id: fuelItem.id },
                orderBy: { slot: "asc" },
            });
            const totalFuel = fuelSlots.reduce((s, sl) => s + sl.quantity, 0);
            if (totalFuel < pirateConfig.fuelCost) {
                return { error: `Need ${pirateConfig.fuelCost} Fuel Cell(s)` };
            }

            // Deduct fuel
            let fuelToDeduct = pirateConfig.fuelCost;
            for (const slot of fuelSlots) {
                if (fuelToDeduct <= 0) break;
                const take = Math.min(slot.quantity, fuelToDeduct);
                fuelToDeduct -= take;
                const newQty = slot.quantity - take;
                if (newQty <= 0) {
                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: { item_id: null, quantity: 0 },
                    });
                } else {
                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: { quantity: newQty },
                    });
                }
            }

            // Deduct credits
            await tx.user.update({
                where: { id: userId },
                data: { money: { decrement: pirateConfig.creditCost } },
            });

            // Update cooldown
            await tx.pirateCooldown.upsert({
                where: { user_id: userId },
                create: { user_id: userId, last_attack_at: new Date() },
                update: { last_attack_at: new Date() },
            });

            // Resolve RPS
            const defenderSeq: RPSValue[] = targetShip.rps_sequence ? JSON.parse(targetShip.rps_sequence) : [];
            const attackerRps = rpsSequence as RPSValue[];
            const rpsResult = resolveRPS(defenderSeq, attackerRps);
            const isSuccess = rpsResult.attackerWins > rpsResult.defenderWins;

            const attack = await tx.pirateAttack.create({
                data: {
                    attacker_id: userId,
                    target_ship_id: targetShipId,
                    attacker_ship_size: sizeKey,
                    attacker_rps: JSON.stringify(rpsSequence),
                    defender_rps: targetShip.rps_sequence,
                    result_detail: JSON.stringify(rpsResult.rounds),
                    attacker_wins: rpsResult.attackerWins,
                    defender_wins: rpsResult.defenderWins,
                    draws: rpsResult.draws,
                    is_success: isSuccess,
                    fuel_cost: pirateConfig.fuelCost,
                    credit_cost: pirateConfig.creditCost,
                    status: "RESOLVED",
                    resolved_at: new Date(),
                },
            });

            if (isSuccess) {
                // Transfer all cargo to attacker's port
                for (const sc of targetShip.cargo) {
                    const order = sc.order;

                    // Mark original order as pirated
                    await tx.purchaseOrder.update({
                        where: { id: order.id },
                        data: { status: "PIRATED" },
                    });

                    // Original cargo box → PIRATED
                    await tx.cargoBox.update({
                        where: { id: order.cargo_box_id },
                        data: { status: "PIRATED" },
                    });

                    // Create new cargo box for the pirate at their port
                    const lootBox = await tx.cargoBox.create({
                        data: {
                            owner_id: userId,
                            size: sc.order.cargo_box.size,
                            status: "AT_PORT",
                        },
                    });

                    // Copy items to loot box
                    for (const item of sc.order.cargo_box.items) {
                        await tx.cargoBoxItem.create({
                            data: {
                                cargo_box_id: lootBox.id,
                                item_id: item.item_id,
                                quantity: item.quantity,
                                equipment_rarity: item.equipment_rarity,
                                equipment_durability: item.equipment_durability,
                                enchant_level: item.enchant_level,
                                special_stat_1: item.special_stat_1,
                                special_stat_2: item.special_stat_2,
                                special_stat_3: item.special_stat_3,
                                special_stat_4: item.special_stat_4,
                            },
                        });
                    }

                    // Buyer loses locked money (no refund)
                    await tx.user.update({
                        where: { id: order.buyer_id },
                        data: { locked_money: { decrement: order.locked_amount } },
                    });

                    // Notify buyer
                    await createNotificationTx(tx, order.buyer_id, "PIRATE_VICTIM_BUYER",
                        "Ship carrying your order was pirated!",
                        `Order #${order.id} was lost to pirates. Your locked payment has been lost.`,
                        { orderId: order.id, attackId: attack.id },
                    );
                }

                // Notify ship owner (seller)
                if (targetShip.owner_id) {
                    await createNotificationTx(tx, targetShip.owner_id, "PIRATE_DEFEND_LOSE",
                        "Your ship was raided!",
                        `Pirates attacked your ship and stole all cargo!`,
                        { shipId: targetShipId, attackId: attack.id },
                    );
                }

                // Notify attacker
                await createNotificationTx(tx, userId, "PIRATE_ATTACK_WIN",
                    "Raid successful!",
                    `You plundered a ship! Check your port for loot.`,
                    { shipId: targetShipId, attackId: attack.id },
                );

                // Mark ship as arrived (empty)
                await tx.ship.update({
                    where: { id: targetShipId },
                    data: { status: "ARRIVED" },
                });
            } else {
                // Attack failed or draw
                // Notify ship owner
                if (targetShip.owner_id) {
                    await createNotificationTx(tx, targetShip.owner_id, "PIRATE_DEFEND_WIN",
                        "Pirate attack repelled!",
                        `A pirate tried to raid your ship but failed!`,
                        { shipId: targetShipId, attackId: attack.id },
                    );
                }

                // Notify attacker
                await createNotificationTx(tx, userId, "PIRATE_ATTACK_LOSE",
                    "Raid failed!",
                    `Your pirate attack was unsuccessful. Fuel Cell and credits lost.`,
                    { shipId: targetShipId, attackId: attack.id },
                );
            }

            return {
                attack,
                rpsResult,
                isSuccess,
            };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({
            attack: result.attack,
            is_success: result.isSuccess,
            rps_result: result.rpsResult,
        });
    } catch (err: any) {
        console.error("launchPirateAttack error:", err);
        res.status(500).json({ error: "Failed to launch pirate attack" });
    }
};

/** GET /game/pirate/cooldown */
export const getPirateCooldown = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const cooldown = await prisma.pirateCooldown.findUnique({ where: { user_id: userId } });

        if (!cooldown) {
            res.json({ on_cooldown: false, available_at: null });
            return;
        }

        const availableAt = new Date(cooldown.last_attack_at.getTime() + SHIP_CONFIG.pirate.cooldownMinutes * 60 * 1000);
        const onCooldown = new Date() < availableAt;

        res.json({
            on_cooldown: onCooldown,
            available_at: onCooldown ? availableAt.toISOString() : null,
        });
    } catch (err: any) {
        console.error("getPirateCooldown error:", err);
        res.status(500).json({ error: "Failed to check cooldown" });
    }
};

/** GET /game/pirate/history */
export const getPirateHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const attacks = await prisma.pirateAttack.findMany({
            where: { attacker_id: userId },
            orderBy: { created_at: "desc" },
            take: 20,
        });

        res.json({ attacks });
    } catch (err: any) {
        console.error("getPirateHistory error:", err);
        res.status(500).json({ error: "Failed to fetch pirate history" });
    }
};
