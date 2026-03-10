import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
}

/** GET /game/port — view port storage and cargo at port */
export const getPort = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        const cityKey = user.city_key;
        if (!cityKey) { res.status(400).json({ error: "Must be in a city" }); return; }

        // Ensure port storage exists
        let portStorage = await prisma.userPortStorage.findUnique({
            where: { user_id_city_key: { user_id: userId, city_key: cityKey } },
        });
        if (!portStorage) {
            portStorage = await prisma.userPortStorage.create({
                data: { user_id: userId, city_key: cityKey, max_slots: 5 },
            });
        }

        // Get cargo boxes at port (from trades)
        const tradeBoxes = await prisma.cargoBox.findMany({
            where: {
                status: "AT_PORT",
                order: {
                    buyer_id: userId,
                    status: "DELIVERED",
                },
            },
            include: {
                items: { include: { item: true } },
                order: { select: { id: true, seller_id: true, created_at: true } },
            },
        });

        // Get cargo boxes at port (from pirate loot) — these are new boxes created for pirate
        const pirateBoxes = await prisma.cargoBox.findMany({
            where: {
                owner_id: userId,
                status: "AT_PORT",
                order: null,
            },
            include: {
                items: { include: { item: true } },
            },
        });

        const allBoxes = [
            ...tradeBoxes.map((b) => ({ ...b, source_type: "trade" as const })),
            ...pirateBoxes.map((b) => ({ ...b, source_type: "pirate" as const })),
        ];

        res.json({
            storage: { max_slots: portStorage.max_slots, used_slots: allBoxes.length },
            boxes: allBoxes,
        });
    } catch (err: any) {
        console.error("getPort error:", err);
        res.status(500).json({ error: "Failed to fetch port" });
    }
};

/** POST /game/port/claim/:boxId — claim cargo from port to inventory */
export const claimCargo = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const cargoBoxId = parseInt(String(req.params.boxId));

        const result = await prisma.$transaction(async (tx) => {
            const box = await tx.cargoBox.findUnique({
                where: { id: cargoBoxId },
                include: {
                    items: { include: { item: true } },
                    order: true,
                },
            });

            if (!box) return { error: "Cargo box not found" };
            if (box.status !== "AT_PORT") return { error: "Cargo is not at port" };

            // Verify ownership: buyer of the order, or pirate loot owner
            const isTradeRecipient = box.order && box.order.buyer_id === userId && box.order.status === "DELIVERED";
            const isPirateLoot = box.owner_id === userId && !box.order;

            if (!isTradeRecipient && !isPirateLoot) {
                return { error: "You are not the recipient of this cargo" };
            }

            // Get inventory slots
            const slots = await tx.inventorySlot.findMany({
                where: { user_id: userId },
                orderBy: { slot: "asc" },
            });

            // Place each cargo item into inventory
            for (const cargoItem of box.items) {
                let remaining = cargoItem.quantity;

                // Existing stacks first
                for (const slot of slots) {
                    if (remaining <= 0) break;
                    if (slot.item_id !== cargoItem.item_id) continue;
                    if ((slot.equipment_rarity ?? null) !== (cargoItem.equipment_rarity ?? null)) continue;

                    const maxStack = cargoItem.item!.max_stack;
                    const canAdd = Math.min(maxStack - slot.quantity, remaining);
                    if (canAdd <= 0) continue;

                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: { quantity: slot.quantity + canAdd },
                    });
                    slot.quantity += canAdd;
                    remaining -= canAdd;
                }

                // Empty slots
                for (const slot of slots) {
                    if (remaining <= 0) break;
                    if (slot.item_id !== null) continue;

                    const maxStack = cargoItem.item!.max_stack;
                    const put = Math.min(maxStack, remaining);

                    await tx.inventorySlot.update({
                        where: { id: slot.id },
                        data: {
                            item_id: cargoItem.item_id,
                            quantity: put,
                            equipment_rarity: cargoItem.equipment_rarity,
                            equipment_durability: cargoItem.equipment_durability,
                            enchant_level: cargoItem.enchant_level,
                            special_stat_1: cargoItem.special_stat_1,
                            special_stat_2: cargoItem.special_stat_2,
                            special_stat_3: cargoItem.special_stat_3,
                            special_stat_4: cargoItem.special_stat_4,
                        },
                    });
                    slot.item_id = cargoItem.item_id;
                    slot.quantity = put;
                    remaining -= put;
                }

                if (remaining > 0) {
                    return { error: "Not enough inventory space to claim all items" };
                }
            }

            // Update order and cargo box
            if (box.order) {
                await tx.purchaseOrder.update({
                    where: { id: box.order.id },
                    data: { status: "CLAIMED" },
                });
            }

            await tx.cargoBox.update({
                where: { id: cargoBoxId },
                data: { status: "CLAIMED" },
            });

            return { success: true };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error("claimCargo error:", err);
        res.status(500).json({ error: "Failed to claim cargo" });
    }
};
