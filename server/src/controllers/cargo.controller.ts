import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { CARGO_BOX_CONFIG, type CargoBoxSizeKey } from "../../../shared/gameConfig";

interface AuthRequest extends Request {
    userId?: number;
}

const ACTIVE_STATUSES = ["EMPTY", "PACKING", "PACKED", "LISTED", "SOLD", "ON_SHIP", "AT_PORT"] as const;

/** GET /game/cargo — list user's cargo boxes */
export const getCargoBoxes = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: {
                items: { include: { item: true } },
                listing: { select: { id: true, price: true, status: true } },
                order: { select: { id: true, status: true, buyer_id: true, expires_at: true } },
            },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("getCargoBoxes error:", err);
        res.status(500).json({ error: "Failed to fetch cargo boxes" });
    }
};

/** POST /game/cargo/buy — buy a cargo box from NPC */
export const buyCargoBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { size } = req.body as { size: string };

        if (!size || !["S", "M", "L"].includes(size)) {
            res.status(400).json({ error: "Invalid size. Must be S, M, or L" });
            return;
        }

        const sizeKey = size as CargoBoxSizeKey;
        const config = CARGO_BOX_CONFIG.sizes[sizeKey];

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

            // Check max boxes
            const activeCount = await tx.cargoBox.count({
                where: { owner_id: userId, status: { in: [...ACTIVE_STATUSES] } },
            });
            if (activeCount >= CARGO_BOX_CONFIG.maxBoxesPerPlayer) {
                return { error: `Maximum ${CARGO_BOX_CONFIG.maxBoxesPerPlayer} active cargo boxes allowed` };
            }

            if (user.money < config.price) {
                return { error: "Not enough money" };
            }

            await tx.user.update({
                where: { id: userId },
                data: { money: { decrement: config.price } },
            });

            const box = await tx.cargoBox.create({
                data: { owner_id: userId, size: sizeKey, status: "EMPTY" },
            });

            return { box };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: { items: { include: { item: true } } },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("buyCargoBox error:", err);
        res.status(500).json({ error: "Failed to buy cargo box" });
    }
};

/** POST /game/cargo/pack — pack a single inventory slot into a cargo box */
export const packCargoBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { boxId: boxIdRaw, slotId, quantity } = req.body as { boxId: number; slotId: number; quantity: number };
        const boxId = parseInt(String(boxIdRaw));

        if (!boxId || !slotId || !quantity || quantity <= 0) {
            res.status(400).json({ error: "boxId, slotId, and quantity are required" });
            return;
        }

        const result = await prisma.$transaction(async (tx) => {
            const box = await tx.cargoBox.findFirst({
                where: { id: boxId, owner_id: userId },
                include: { items: true },
            });

            if (!box) return { error: "Cargo box not found" };

            if (box.status !== "EMPTY" && box.status !== "PACKING") {
                return { error: "Can only pack items into EMPTY or PACKING boxes" };
            }

            const sizeConfig = CARGO_BOX_CONFIG.sizes[box.size as CargoBoxSizeKey];
            const currentItemCount = box.items.reduce((sum, i) => sum + i.quantity, 0);

            if (currentItemCount + quantity > sizeConfig.capacity) {
                return { error: `Cargo box capacity exceeded. Max: ${sizeConfig.capacity}, current: ${currentItemCount}, adding: ${quantity}` };
            }

            const slot = await tx.inventorySlot.findFirst({
                where: { id: slotId, user_id: userId },
                include: { item: true },
            });

            if (!slot || !slot.item_id || slot.quantity < quantity) {
                return { error: "Insufficient items in inventory slot" };
            }

            await tx.cargoBoxItem.create({
                data: {
                    cargo_box_id: boxId,
                    item_id: slot.item_id,
                    quantity,
                    equipment_rarity: slot.equipment_rarity,
                    equipment_durability: slot.equipment_durability,
                    enchant_level: slot.enchant_level,
                    special_stat_1: slot.special_stat_1,
                    special_stat_2: slot.special_stat_2,
                    special_stat_3: slot.special_stat_3,
                    special_stat_4: slot.special_stat_4,
                },
            });

            const remaining = slot.quantity - quantity;
            if (remaining <= 0) {
                await tx.inventorySlot.update({
                    where: { id: slot.id },
                    data: { item_id: null, quantity: 0, equipment_rarity: null, equipment_durability: null, enchant_level: 0, special_stat_1: null, special_stat_2: null, special_stat_3: null, special_stat_4: null },
                });
            } else {
                await tx.inventorySlot.update({ where: { id: slot.id }, data: { quantity: remaining } });
            }

            await tx.cargoBox.update({ where: { id: boxId }, data: { status: "PACKING" } });

            return { success: true };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: { items: { include: { item: true } } },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("packCargoBox error:", err);
        res.status(500).json({ error: "Failed to pack cargo box" });
    }
};

/** POST /game/cargo/unpack — remove a single item from cargo box back to inventory */
export const unpackCargoBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const { boxId: boxIdRaw, boxItemId, quantity } = req.body as { boxId: number; boxItemId: number; quantity: number };
        const boxId = parseInt(String(boxIdRaw));
        const cargoItemIds = [boxItemId];
        const all = false;

        const result = await prisma.$transaction(async (tx) => {
            const box = await tx.cargoBox.findFirst({
                where: { id: boxId, owner_id: userId },
                include: { items: { include: { item: true } } },
            });

            if (!box) return { error: "Cargo box not found" };

            if (!["EMPTY", "PACKING", "PACKED"].includes(box.status)) {
                return { error: "Can only unpack from EMPTY, PACKING, or PACKED boxes" };
            }

            const itemsToUnpack = all
                ? box.items
                : box.items.filter((i) => cargoItemIds?.includes(i.id));

            if (itemsToUnpack.length === 0) {
                return { error: "No items to unpack" };
            }

            // Check inventory space
            const slots = await tx.inventorySlot.findMany({
                where: { user_id: userId },
                orderBy: { slot: "asc" },
            });

            // Try to place each item back
            for (const cargoItem of itemsToUnpack) {
                let remaining = cargoItem.quantity;

                // Try existing stacks first
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

                // Try empty slots
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
                    return { error: "Not enough inventory space" };
                }

                await tx.cargoBoxItem.delete({ where: { id: cargoItem.id } });
            }

            // Update box status
            const remainingItems = await tx.cargoBoxItem.count({ where: { cargo_box_id: boxId } });
            await tx.cargoBox.update({
                where: { id: boxId },
                data: { status: remainingItems > 0 ? "PACKING" : "EMPTY" },
            });

            return { success: true };
        });

        if ("error" in result) {
            res.status(400).json({ error: result.error });
            return;
        }

        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: { items: { include: { item: true } } },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("unpackCargoBox error:", err);
        res.status(500).json({ error: "Failed to unpack cargo box" });
    }
};

/** POST /game/cargo/:boxId/finalize — mark as packed, ready to list */
export const finalizeCargoBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const boxId = parseInt(String(req.params.boxId));

        const box = await prisma.cargoBox.findFirst({
            where: { id: boxId, owner_id: userId },
            include: { items: true },
        });

        if (!box) { res.status(404).json({ error: "Cargo box not found" }); return; }
        if (box.status !== "PACKING") { res.status(400).json({ error: "Box must be in PACKING status" }); return; }
        if (box.items.length === 0) { res.status(400).json({ error: "Box has no items" }); return; }

        await prisma.cargoBox.update({
            where: { id: boxId },
            data: { status: "PACKED" },
        });

        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: { items: { include: { item: true } } },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("finalizeCargoBox error:", err);
        res.status(500).json({ error: "Failed to finalize cargo box" });
    }
};

/** DELETE /game/cargo/:boxId — discard a cargo box, returning items to inventory */
export const discardCargoBox = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const boxId = parseInt(String(req.params.boxId));

        const box = await prisma.cargoBox.findFirst({
            where: { id: boxId, owner_id: userId },
            include: { items: { include: { item: true } } },
        });

        if (!box) { res.status(404).json({ error: "Cargo box not found" }); return; }
        if (!["EMPTY", "PACKING", "PACKED"].includes(box.status)) {
            res.status(400).json({ error: "Can only discard open or sealed boxes" });
            return;
        }

        await prisma.$transaction(async (tx) => {
            if (box.items.length > 0) {
                const slots = await tx.inventorySlot.findMany({ where: { user_id: userId }, orderBy: { slot: "asc" } });
                for (const cargoItem of box.items) {
                    let remaining = cargoItem.quantity;
                    for (const slot of slots) {
                        if (remaining <= 0) break;
                        if (slot.item_id !== cargoItem.item_id) continue;
                        const maxStack = cargoItem.item!.max_stack;
                        const canAdd = Math.min(maxStack - slot.quantity, remaining);
                        if (canAdd <= 0) continue;
                        await tx.inventorySlot.update({ where: { id: slot.id }, data: { quantity: slot.quantity + canAdd } });
                        slot.quantity += canAdd;
                        remaining -= canAdd;
                    }
                    for (const slot of slots) {
                        if (remaining <= 0) break;
                        if (slot.item_id !== null) continue;
                        const put = Math.min(cargoItem.item!.max_stack, remaining);
                        await tx.inventorySlot.update({
                            where: { id: slot.id },
                            data: { item_id: cargoItem.item_id, quantity: put, equipment_rarity: cargoItem.equipment_rarity, equipment_durability: cargoItem.equipment_durability, enchant_level: cargoItem.enchant_level, special_stat_1: cargoItem.special_stat_1, special_stat_2: cargoItem.special_stat_2, special_stat_3: cargoItem.special_stat_3, special_stat_4: cargoItem.special_stat_4 },
                        });
                        slot.item_id = cargoItem.item_id;
                        slot.quantity = put;
                        remaining -= put;
                    }
                }
                await tx.cargoBoxItem.deleteMany({ where: { cargo_box_id: boxId } });
            }
            await tx.cargoBox.delete({ where: { id: boxId } });
        });

        const boxes = await prisma.cargoBox.findMany({
            where: { owner_id: userId },
            include: { items: { include: { item: true } } },
            orderBy: { created_at: "desc" },
        });
        res.json({ boxes });
    } catch (err: any) {
        console.error("discardCargoBox error:", err);
        res.status(500).json({ error: "Failed to discard cargo box" });
    }
};
