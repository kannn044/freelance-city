import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { INVENTORY_SLOTS, type EquipmentRarity } from "../config/game.config";
import { syncHunger, applyMealEffect } from "../services/hunger.service";

interface AuthRequest extends Request {
    userId?: number;
}

const EQUIPMENT_SLOTS = ["HEAD", "UPPER_BODY", "LOWER_BODY", "ARM", "GLOVE", "SHOE"] as const;

async function ensureEquipmentRows(userId: number) {
    for (const slot of EQUIPMENT_SLOTS) {
        await prisma.$executeRaw`
            INSERT INTO user_equipments (user_id, slot, item_id, item_rarity, updated_at)
            VALUES (${userId}, ${slot}, NULL, NULL, NOW())
            ON DUPLICATE KEY UPDATE updated_at = updated_at
        `;
    }
}

async function getEquipmentState(userId: number) {
    await ensureEquipmentRows(userId);
    return prisma.$queryRaw<Array<{
        slot: string;
        item_id: number | null;
        item_rarity: EquipmentRarity | null;
        item_name: string | null;
        item_icon: string | null;
        effect_key: string | null;
        effect_value: number | null;
        effect_value2: number | null;
    }>>`
        SELECT ue.slot,
               ue.item_id,
             ue.item_rarity,
               i.name as item_name,
               i.icon as item_icon,
               i.effect_key as effect_key,
               i.effect_value as effect_value,
               i.effect_value2 as effect_value2
        FROM user_equipments ue
        LEFT JOIN items i ON i.id = ue.item_id
        WHERE ue.user_id = ${userId}
        ORDER BY FIELD(ue.slot, 'HEAD', 'UPPER_BODY', 'LOWER_BODY', 'ARM', 'GLOVE', 'SHOE')
    `;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function addItemToInventory(
    userId: number,
    itemId: number,
    qty: number,
    db: DbClient = prisma,
    equipmentRarity: EquipmentRarity | null = null,
): Promise<boolean> {
    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) return false;

    let remaining = qty;
    const slots = await db.inventorySlot.findMany({
        where: { user_id: userId },
        orderBy: { slot: "asc" },
    });

    for (const slot of slots) {
        if (remaining <= 0) break;
        const sameRarity = item.type !== "EQUIPMENT" || (slot as any).equipment_rarity === (equipmentRarity ?? "NORMAL");
        if (slot.item_id !== itemId || slot.quantity >= item.max_stack || !sameRarity) continue;

        const add = Math.min(item.max_stack - slot.quantity, remaining);
        remaining -= add;
        await db.inventorySlot.update({
            where: { id: slot.id },
            data: { quantity: slot.quantity + add },
        });
    }

    for (const slot of slots) {
        if (remaining <= 0) break;
        if (slot.item_id !== null) continue;

        const put = Math.min(item.max_stack, remaining);
        remaining -= put;
        await db.inventorySlot.update({
            where: { id: slot.id },
            data: { item_id: itemId, quantity: put },
        });
        if (item.type === "EQUIPMENT") {
            await db.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = ${equipmentRarity ?? "NORMAL"}
                WHERE id = ${slot.id}
            `;
        } else {
            await db.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL
                WHERE id = ${slot.id}
            `;
        }
    }

    return remaining === 0;
}

/**
 * GET /game/inventory — Get player's 8 inventory slots
 */
export const getInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Ensure 8 slots exist
        const existing = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        if (existing.length < INVENTORY_SLOTS) {
            const existingSlots = new Set(existing.map((s) => s.slot));
            const creates = [];
            for (let i = 0; i < INVENTORY_SLOTS; i++) {
                if (!existingSlots.has(i)) {
                    creates.push({ user_id: req.userId!, slot: i });
                }
            }
            if (creates.length > 0) {
                await prisma.inventorySlot.createMany({ data: creates });
            }
            const slots = await prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
                orderBy: { slot: "asc" },
            });
            const equipment = await getEquipmentState(req.userId!);
            res.json({ slots, equipment });
            return;
        }

        const equipment = await getEquipmentState(req.userId!);
        res.json({ slots: existing, equipment });
    } catch (error) {
        console.error("getInventory error:", error);
        res.status(500).json({ error: "Failed to fetch inventory" });
    }
};

/**
 * POST /game/equipment/equip — Equip one equipment item from inventory slot
 * Body: { slotId: number }
 */
export const equipItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slotId } = req.body as { slotId?: number };
        if (!slotId) {
            res.status(400).json({ error: "slotId is required" });
            return;
        }

        const invSlot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!invSlot?.item || invSlot.quantity <= 0) {
            res.status(400).json({ error: "No item in selected slot" });
            return;
        }
        const equippedItem = invSlot.item;

        if (equippedItem.type !== "EQUIPMENT" || !equippedItem.equipment_slot) {
            res.status(400).json({ error: "Selected item is not equipment" });
            return;
        }

        const equipSlot = equippedItem.equipment_slot;

        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`
                INSERT INTO user_equipments (user_id, slot, item_id, updated_at)
                VALUES (${req.userId!}, ${equipSlot}, NULL, NOW())
                ON DUPLICATE KEY UPDATE updated_at = updated_at
            `;

            const current = await tx.$queryRaw<Array<{ item_id: number | null }>>`
                SELECT item_id
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
                LIMIT 1
            `;

            const currentItemId = current[0]?.item_id ?? null;
            const currentRow = await tx.$queryRaw<Array<{ item_rarity: EquipmentRarity | null }>>`
                SELECT item_rarity
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
                LIMIT 1
            `;
            const currentRarity = currentRow[0]?.item_rarity ?? "NORMAL";

            const invRarityRow = await tx.$queryRaw<Array<{ equipment_rarity: EquipmentRarity | null }>>`
                SELECT equipment_rarity
                FROM inventory_slots
                WHERE id = ${invSlot.id}
                LIMIT 1
            `;
            const equippedRarity = invRarityRow[0]?.equipment_rarity ?? "NORMAL";

            if (invSlot.quantity > 1) {
                await tx.inventorySlot.update({
                    where: { id: invSlot.id },
                    data: { quantity: invSlot.quantity - 1 },
                });
            } else {
                await tx.inventorySlot.update({
                    where: { id: invSlot.id },
                    data: { item_id: null, quantity: 0 },
                });
                await tx.$executeRaw`
                    UPDATE inventory_slots
                    SET equipment_rarity = NULL
                    WHERE id = ${invSlot.id}
                `;
            }

            if (currentItemId) {
                const movedBack = await addItemToInventory(req.userId!, Number(currentItemId), 1, tx, currentRarity);
                if (!movedBack) {
                    throw new Error("Inventory full. Unequip failed");
                }
            }

            await tx.$executeRaw`
                UPDATE user_equipments
                SET item_id = ${equippedItem.id}, item_rarity = ${equippedRarity}, updated_at = NOW()
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
            `;
        });

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });
        const equipment = await getEquipmentState(req.userId!);

        res.json({
            message: `Equipped ${equippedItem.name}`,
            slots,
            equipment,
        });
    } catch (error: any) {
        console.error("equipItem error:", error);
        res.status(500).json({ error: error?.message || "Failed to equip item" });
    }
};

/**
 * POST /game/equipment/unequip — Unequip by slot
 * Body: { slot: "HEAD" | "UPPER_BODY" | "LOWER_BODY" | "ARM" | "GLOVE" | "SHOE" }
 */
export const unequipItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slot } = req.body as { slot?: string };
        if (!slot || !EQUIPMENT_SLOTS.includes(slot as any)) {
            res.status(400).json({ error: "Invalid equipment slot" });
            return;
        }

        await ensureEquipmentRows(req.userId!);
        const row = await prisma.$queryRaw<Array<{ item_id: number | null; item_rarity: EquipmentRarity | null }>>`
            SELECT item_id, item_rarity
            FROM user_equipments
            WHERE user_id = ${req.userId!} AND slot = ${slot}
            LIMIT 1
        `;

        const itemId = row[0]?.item_id ?? null;
        const itemRarity = row[0]?.item_rarity ?? "NORMAL";
        if (!itemId) {
            res.status(400).json({ error: "No item equipped in this slot" });
            return;
        }

        const moved = await addItemToInventory(req.userId!, Number(itemId), 1, prisma, itemRarity);
        if (!moved) {
            res.status(400).json({ error: "Inventory full" });
            return;
        }

        await prisma.$executeRaw`
            UPDATE user_equipments
            SET item_id = NULL, item_rarity = NULL, updated_at = NOW()
            WHERE user_id = ${req.userId!} AND slot = ${slot}
        `;

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });
        const equipment = await getEquipmentState(req.userId!);

        res.json({
            message: "Unequipped item",
            slots,
            equipment,
        });
    } catch (error) {
        console.error("unequipItem error:", error);
        res.status(500).json({ error: "Failed to unequip item" });
    }
};

/**
 * POST /game/eat/:slotId — Eat a food item from inventory
 */
export const eatItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (typeof req.params.slotId !== 'string') {
            res.status(400).json({ error: "Invalid slot ID" });
            return;
        }
        const slotId = parseInt(req.params.slotId);
        const slot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!slot || !slot.item) {
            res.status(400).json({ error: "No item in this slot" });
            return;
        }

        if (!slot.item.kcal || slot.item.kcal <= 0) {
            res.status(400).json({ error: "This item cannot be eaten" });
            return;
        }

        // Apply meal effect
        const user = await applyMealEffect(
            req.userId!,
            slot.item.kcal,
            slot.item.buff_pct,
            slot.item.buff_mins
        );

        // Reduce quantity or clear slot
        if (slot.quantity > 1) {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { quantity: slot.quantity - 1 },
            });
        } else {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { item_id: null, quantity: 0 },
            });
        }

        // Fetch updated slots
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Ate ${slot.item.name}. +${slot.item.kcal} Kcal`,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                money: user.money,
                hunger: user.hunger,
                satiety_buff: user.satiety_buff,
                buff_expires_at: user.buff_expires_at,
            },
            slots,
        });
    } catch (error) {
        console.error("eatItem error:", error);
        res.status(500).json({ error: "Failed to eat item" });
    }
};
