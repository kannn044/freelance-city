import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
    INVENTORY_SLOTS,
    getFoodRarityBuffMultiplier,
    type EquipmentRarity,
} from "../config/game.config";
import { syncHunger, applyMealEffect } from "../services/hunger.service";
import { getEffectiveMaxStack, getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getUserCityProfile } from "../services/city.service";
import { reconcileWorkspaceOrderPausesForUser } from "../services/workspaceRules.service";
import { toJobPayload } from "../lib/userPayload";
import { syncDurability, ensureDurabilityColumns } from "../services/durability.service";
import { MAX_DURABILITY } from "../config/game.config";

interface AuthRequest extends Request {
    userId?: number;
}

type InventoryOrganizeMode = "combine" | "sort-az";

const EQUIPMENT_SLOTS = ["HEAD", "UPPER_BODY", "LOWER_BODY", "ARM", "GLOVE", "SHOE"] as const;

async function ensureEquipmentRows(userId: number) {
    for (const slot of EQUIPMENT_SLOTS) {
        await prisma.$executeRaw`
            INSERT INTO user_equipments (user_id, slot, item_id, item_rarity, updated_at, durability_updated_at)
            VALUES (${userId}, ${slot}, NULL, NULL, ${new Date()}, ${new Date()})
            ON DUPLICATE KEY UPDATE updated_at = updated_at
        `;
    }
}

async function getEquipmentState(userId: number) {
    await ensureEquipmentRows(userId);
    await ensureDurabilityColumns();
    return prisma.$queryRaw<Array<{
        slot: string;
        item_id: number | null;
        item_rarity: EquipmentRarity | null;
        durability: number;
        durability_updated_at: Date;
        item_name: string | null;
        item_icon: string | null;
        effect_key: string | null;
        effect_value: number | null;
        effect_value2: number | null;
    }>>`
        SELECT ue.slot,
               ue.item_id,
             ue.item_rarity,
               ue.durability,
               ue.durability_updated_at,
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
    equipmentDurability: number | null = null,
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
        const sameDurability = item.type !== "EQUIPMENT" || (slot as any).equipment_durability === equipmentDurability;
        if (slot.item_id !== itemId || slot.quantity >= item.max_stack || !sameRarity || !sameDurability) continue;

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
                SET equipment_rarity = ${equipmentRarity ?? "NORMAL"},
                    equipment_durability = ${equipmentDurability}
                WHERE id = ${slot.id}
            `;
        } else {
            await db.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL,
                    equipment_durability = NULL
                WHERE id = ${slot.id}
            `;
        }
    }

    return remaining === 0;
}

/**
 * GET /game/inventory — Get player's 16 inventory slots
 */
export const getInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Ensure 16 slots exist
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
            await syncDurability(req.userId!);
            const equipmentSynced = await getEquipmentState(req.userId!);
            res.json({ slots, equipment: equipmentSynced });
            return;
        }

        await syncDurability(req.userId!);
        const equipment = await getEquipmentState(req.userId!);
        res.json({ slots: existing, equipment });
    } catch (error) {
        console.error("getInventory error:", error);
        res.status(500).json({ error: "Failed to fetch inventory" });
    }
};

/**
 * POST /game/inventory/organize — Combine stacks or sort inventory
 * Body: { mode: "combine" | "sort-az" }
 */
export const organizeInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncDurability(req.userId!);
        const mode = String(req.body?.mode ?? "combine") as InventoryOrganizeMode;
        if (mode !== "combine" && mode !== "sort-az") {
            res.status(400).json({ error: "Invalid organize mode" });
            return;
        }

        type InventoryRow = {
            id: number;
            slot: number;
            item_id: number | null;
            quantity: number;
            equipment_rarity: EquipmentRarity | null;
            equipment_durability: number | null;
            item_name: string | null;
            item_type: string | null;
            item_max_stack: number | null;
        };

        const rows = await prisma.$queryRaw<InventoryRow[]>`
            SELECT s.id,
                   s.slot,
                   s.item_id,
                   s.quantity,
                   s.equipment_rarity,
                   s.equipment_durability,
                   i.name AS item_name,
                   i.type AS item_type,
                   i.max_stack AS item_max_stack
            FROM inventory_slots s
            LEFT JOIN items i ON i.id = s.item_id
            WHERE s.user_id = ${req.userId!}
            ORDER BY s.slot ASC
        `;

        if (rows.length === 0) {
            res.status(400).json({ error: "No inventory slots found" });
            return;
        }

        const rarityRank: Record<string, number> = {
            NORMAL: 0,
            RARE: 1,
            EPIC: 2,
            LEGENDARY: 3,
        };

        const effects = await getUserEquipmentEffects(req.userId!);

        type Bucket = {
            itemId: number;
            rarity: EquipmentRarity | null;
            durability: number | null;
            itemName: string;
            itemType: string;
            maxStack: number;
            totalQty: number;
            firstSlot: number;
        };

        const bucketMap = new Map<string, Bucket>();
        for (const row of rows) {
            if (!row.item_id || row.quantity <= 0 || !row.item_name || !row.item_max_stack || !row.item_type) continue;
            const rarityKey = row.equipment_rarity ?? "";
            const durabilityKey = row.equipment_durability ?? "";
            const key = `${row.item_id}:${rarityKey}:${durabilityKey}`;
            const existing = bucketMap.get(key);
            if (existing) {
                existing.totalQty += row.quantity;
                continue;
            }
            const effectiveMaxStack = getEffectiveMaxStack(row.item_type, row.item_max_stack, effects);
            bucketMap.set(key, {
                itemId: row.item_id,
                rarity: row.equipment_rarity,
                durability: row.equipment_durability,
                itemName: row.item_name,
                itemType: row.item_type,
                maxStack: effectiveMaxStack,
                totalQty: row.quantity,
                firstSlot: row.slot,
            });
        }

        let buckets = Array.from(bucketMap.values());

        if (mode === "sort-az") {
            buckets = buckets.sort((a, b) => {
                const nameCmp = a.itemName.localeCompare(b.itemName);
                if (nameCmp !== 0) return nameCmp;
                const ra = rarityRank[String(a.rarity ?? "")] ?? -1;
                const rb = rarityRank[String(b.rarity ?? "")] ?? -1;
                if (ra !== rb) return ra - rb;
                return a.firstSlot - b.firstSlot;
            });
        } else {
            buckets = buckets.sort((a, b) => a.firstSlot - b.firstSlot);
        }

        const normalized: Array<{ itemId: number; quantity: number; rarity: EquipmentRarity | null; durability: number | null }> = [];
        for (const b of buckets) {
            let remain = b.totalQty;
            while (remain > 0) {
                const put = Math.min(remain, Math.max(1, b.maxStack));
                normalized.push({ itemId: b.itemId, quantity: put, rarity: b.rarity, durability: b.durability });
                remain -= put;
            }
        }

        if (normalized.length > rows.length) {
            res.status(400).json({ error: "Not enough inventory slots to reorganize" });
            return;
        }

        await prisma.$transaction(async (tx) => {
            for (let i = 0; i < rows.length; i++) {
                const target = normalized[i];
                if (target) {
                    await tx.$executeRaw`
                        UPDATE inventory_slots
                        SET item_id = ${target.itemId},
                            quantity = ${target.quantity},
                            equipment_rarity = ${target.rarity},
                            equipment_durability = ${target.durability}
                        WHERE id = ${rows[i].id}
                    `;
                } else {
                    await tx.$executeRaw`
                        UPDATE inventory_slots
                        SET item_id = NULL,
                            quantity = 0,
                            equipment_rarity = NULL,
                            equipment_durability = NULL
                        WHERE id = ${rows[i].id}
                    `;
                }
            }
        });

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const cityProfile = await getUserCityProfile(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

        const equipment = await getEquipmentState(req.userId!);

        res.json({
            message: mode === "sort-az" ? "Inventory sorted A-Z" : "Inventory combined",
            slots,
            equipment,
        });
    } catch (error) {
        console.error("organizeInventory error:", error);
        res.status(500).json({ error: "Failed to organize inventory" });
    }
};

/**
 * POST /game/inventory/discard — Discard item(s) from an inventory slot
 * Body: { slotId: number, quantity?: number }
 */
export const discardItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncDurability(req.userId!);
        const slotId = Number(req.body?.slotId);
        const quantityRaw = req.body?.quantity;

        if (!Number.isInteger(slotId) || slotId <= 0) {
            res.status(400).json({ error: "Invalid slotId" });
            return;
        }

        const slot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!slot || !slot.item || slot.quantity <= 0) {
            res.status(400).json({ error: "No item in this slot" });
            return;
        }

        const requestedQty = quantityRaw == null
            ? slot.quantity
            : Math.floor(Number(quantityRaw));

        if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
            res.status(400).json({ error: "Invalid quantity" });
            return;
        }

        if (requestedQty > slot.quantity) {
            res.status(400).json({ error: `Cannot discard ${requestedQty}. Slot has only ${slot.quantity}.` });
            return;
        }

        if (slot.quantity - requestedQty > 0) {
            await prisma.inventorySlot.update({
                where: { id: slot.id },
                data: { quantity: slot.quantity - requestedQty },
            });
        } else {
            await prisma.inventorySlot.update({
                where: { id: slot.id },
                data: { item_id: null, quantity: 0 },
            });
            await prisma.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL, equipment_durability = NULL
                WHERE id = ${slot.id}
            `;
        }

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const cityProfile = await getUserCityProfile(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

        const equipment = await getEquipmentState(req.userId!);

        res.json({
            message: `Discarded ${requestedQty}x ${slot.item.name}`,
            slots,
            equipment,
        });
    } catch (error) {
        console.error("discardItem error:", error);
        res.status(500).json({ error: "Failed to discard item" });
    }
};

/**
 * POST /game/equipment/equip — Equip one equipment item from inventory slot
 * Body: { slotId: number }
 */
export const equipItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await syncDurability(req.userId!);
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
                INSERT INTO user_equipments (user_id, slot, item_id, updated_at, durability_updated_at)
                VALUES (${req.userId!}, ${equipSlot}, NULL, ${new Date()}, ${new Date()})
                ON DUPLICATE KEY UPDATE updated_at = updated_at
            `;

            const current = await tx.$queryRaw<Array<{ item_id: number | null }>>`
                SELECT item_id
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
                LIMIT 1
            `;

            const currentItemId = current[0]?.item_id ?? null;
            const currentRow = await tx.$queryRaw<Array<{ item_rarity: EquipmentRarity | null; durability: number }>>`
                SELECT item_rarity, durability
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
                LIMIT 1
            `;
            const currentRarity = currentRow[0]?.item_rarity ?? "NORMAL";
            const currentDurability = currentRow[0]?.durability ?? MAX_DURABILITY;

            const invRarityRow = await tx.$queryRaw<Array<{ equipment_rarity: EquipmentRarity | null; equipment_durability: number | null }>>`
                SELECT equipment_rarity, equipment_durability
                FROM inventory_slots
                WHERE id = ${invSlot.id}
                LIMIT 1
            `;
            const equippedRarity = invRarityRow[0]?.equipment_rarity ?? "NORMAL";
            const equippedDurability = invRarityRow[0]?.equipment_durability ?? MAX_DURABILITY;

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
                    SET equipment_rarity = NULL, equipment_durability = NULL
                    WHERE id = ${invSlot.id}
                `;
            }

            if (currentItemId) {
                const movedBack = await addItemToInventory(req.userId!, Number(currentItemId), 1, tx, currentRarity, currentDurability);
                if (!movedBack) {
                    throw new Error("Inventory full. Unequip failed");
                }
            }

            await tx.$executeRaw`
                UPDATE user_equipments
                SET item_id = ${equippedItem.id}, item_rarity = ${equippedRarity}, durability = ${equippedDurability}, durability_updated_at = ${new Date()}, updated_at = ${new Date()}
                WHERE user_id = ${req.userId!} AND slot = ${equipSlot}
            `;
        });

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const cityProfile = await getUserCityProfile(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

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
        await syncDurability(req.userId!);
        const { slot } = req.body as { slot?: string };
        if (!slot || !EQUIPMENT_SLOTS.includes(slot as any)) {
            res.status(400).json({ error: "Invalid equipment slot" });
            return;
        }

        await ensureEquipmentRows(req.userId!);
        const row = await prisma.$queryRaw<Array<{ item_id: number | null; item_rarity: EquipmentRarity | null; durability: number }>>`
            SELECT item_id, item_rarity, durability
            FROM user_equipments
            WHERE user_id = ${req.userId!} AND slot = ${slot}
            LIMIT 1
        `;

        const itemId = row[0]?.item_id ?? null;
        const itemRarity = row[0]?.item_rarity ?? "NORMAL";
        const itemDurability = row[0]?.durability ?? MAX_DURABILITY;
        if (!itemId) {
            res.status(400).json({ error: "No item equipped in this slot" });
            return;
        }

        const moved = await addItemToInventory(req.userId!, Number(itemId), 1, prisma, itemRarity, itemDurability);
        if (!moved) {
            res.status(400).json({ error: "Inventory full" });
            return;
        }

        await prisma.$executeRaw`
            UPDATE user_equipments
            SET item_id = NULL, item_rarity = NULL, updated_at = ${new Date()}
            WHERE user_id = ${req.userId!} AND slot = ${slot}
        `;

        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const cityProfile = await getUserCityProfile(req.userId!);
        await reconcileWorkspaceOrderPausesForUser(req.userId!, cityProfile.city_key);

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

        const rarity = ((slot as any).equipment_rarity as EquipmentRarity | null) ?? "NORMAL";
        const effectiveBuffPct = slot.item.type === "MEAL"
            ? (slot.item.buff_pct ?? 0) * getFoodRarityBuffMultiplier(rarity)
            : (slot.item.buff_pct ?? 0);

        // Apply meal effect
        const user = await applyMealEffect(
            req.userId!,
            slot.item.kcal,
            effectiveBuffPct,
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
            await prisma.$executeRaw`
                UPDATE inventory_slots
                SET equipment_rarity = NULL, equipment_durability = NULL
                WHERE id = ${slotId}
            `;
        }

        // Fetch updated slots
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Ate ${slot.item.name}. +${slot.item.kcal} Kcal`,
            user: toJobPayload({
                id: user.id,
                email: user.email,
                role: user.role,
                money: user.money,
                hunger: user.hunger,
                satiety_buff: user.satiety_buff,
                buff_expires_at: user.buff_expires_at,
            }),
            slots,
        });
    } catch (error) {
        console.error("eatItem error:", error);
        res.status(500).json({ error: "Failed to eat item" });
    }
};

// ─── Repair ──────────────────────────────────────────────

interface RepairIngredientRow {
    item_id: number;
    item_name: string;
    item_icon: string;
    recipe_qty: number;
}

/**
 * GET /game/equipment/repair-cost?slot=HEAD
 * Returns the material cost to fully repair the equipped item in the given slot.
 */
export const getRepairCost = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const slot = String(req.query.slot ?? "").toUpperCase();
        const slotIdRaw = req.query.slotId;
        const slotId = slotIdRaw ? Number(slotIdRaw) : undefined;

        if (!slotId && !["HEAD", "UPPER_BODY", "LOWER_BODY", "ARM", "GLOVE", "SHOE"].includes(slot)) {
            res.status(400).json({ error: "Invalid slot or slotId" });
            return;
        }

        await ensureDurabilityColumns();
        await syncDurability(req.userId!);

        let itemId: number | null = null;
        let durability: number = MAX_DURABILITY;

        if (slotId) {
            const invSlot = await prisma.inventorySlot.findFirst({
                where: { id: slotId, user_id: req.userId! },
            });
            if (!invSlot || !invSlot.item_id) {
                res.status(400).json({ error: "No item in this inventory slot" });
                return;
            }
            itemId = invSlot.item_id;
            durability = Number((invSlot as any).equipment_durability ?? MAX_DURABILITY);
        } else {
            // Get equipped item + durability
            const eqRows = await prisma.$queryRaw<Array<{ item_id: number | null; durability: number }>>`
                SELECT item_id, durability
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${slot}
                LIMIT 1
            `;
            const eq = eqRows[0];
            if (!eq?.item_id) {
                res.status(400).json({ error: "No item equipped in this slot" });
                return;
            }
            itemId = eq.item_id;
            durability = Number(eq.durability);
        }

        if (durability >= MAX_DURABILITY) {
            res.json({ ingredients: [], missingPct: 0, durability, maxDurability: MAX_DURABILITY });
            return;
        }

        // Find crafting recipe for this item
        const recipe = await prisma.recipe.findFirst({
            where: { output_item_id: itemId },
            include: {
                ingredients: {
                    include: { item: true },
                },
            },
        });

        if (!recipe) {
            res.status(400).json({ error: "No crafting recipe found for this equipment" });
            return;
        }

        const missingPct = (MAX_DURABILITY - durability) / MAX_DURABILITY;

        const ingredients = recipe.ingredients.map((ing) => ({
            item_id: ing.item_id,
            item_name: ing.item.name,
            item_icon: ing.item.icon,
            recipe_qty: ing.quantity,
            repair_qty: Math.ceil(ing.quantity * missingPct),
        }));

        res.json({
            ingredients,
            missingPct: Math.round(missingPct * 100),
            durability: Math.round(durability),
            maxDurability: MAX_DURABILITY,
        });
    } catch (error) {
        console.error("getRepairCost error:", error);
        res.status(500).json({ error: "Failed to get repair cost" });
    }
};

/**
 * POST /game/equipment/repair  body: { slot: "HEAD" }
 * Deduct repair materials from inventory and restore durability to 100.
 */
export const repairEquipment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const slot = String(req.body.slot ?? "").toUpperCase();
        const slotIdRaw = req.body.slotId;
        const slotId = slotIdRaw ? Number(slotIdRaw) : undefined;

        if (!slotId && !["HEAD", "UPPER_BODY", "LOWER_BODY", "ARM", "GLOVE", "SHOE"].includes(slot)) {
            res.status(400).json({ error: "Invalid slot or slotId" });
            return;
        }

        await ensureDurabilityColumns();
        await syncDurability(req.userId!);

        let itemId: number | null = null;
        let durability: number = MAX_DURABILITY;
        let eqIdToUpdate: number | null = null;

        if (slotId) {
            const invSlot = await prisma.inventorySlot.findFirst({
                where: { id: slotId, user_id: req.userId! },
            });
            if (!invSlot || !invSlot.item_id) {
                res.status(400).json({ error: "No item in this inventory slot" });
                return;
            }
            itemId = invSlot.item_id;
            durability = Number((invSlot as any).equipment_durability ?? MAX_DURABILITY);
        } else {
            // Get equipped item + durability
            const eqRows = await prisma.$queryRaw<Array<{ id: number; item_id: number | null; durability: number }>>`
                SELECT id, item_id, durability
                FROM user_equipments
                WHERE user_id = ${req.userId!} AND slot = ${slot}
                LIMIT 1
            `;
            const eq = eqRows[0];
            if (!eq?.item_id) {
                res.status(400).json({ error: "No item equipped in this slot" });
                return;
            }
            itemId = eq.item_id;
            durability = Number(eq.durability);
            eqIdToUpdate = eq.id;
        }

        if (durability >= MAX_DURABILITY) {
            res.status(400).json({ error: "Equipment is already at full durability" });
            return;
        }

        // Find crafting recipe
        const recipe = await prisma.recipe.findFirst({
            where: { output_item_id: itemId },
            include: {
                ingredients: {
                    include: { item: true },
                },
            },
        });

        if (!recipe) {
            res.status(400).json({ error: "No crafting recipe found for this equipment" });
            return;
        }

        const missingPct = (MAX_DURABILITY - durability) / MAX_DURABILITY;

        // Calculate required materials
        const repairCosts = recipe.ingredients.map((ing) => ({
            item_id: ing.item_id,
            item_name: ing.item.name,
            repair_qty: Math.ceil(ing.quantity * missingPct),
        }));

        // Transaction: verify materials + deduct + repair
        await prisma.$transaction(async (tx) => {
            const userSlots = await tx.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
            });

            // Check if user has enough materials
            for (const cost of repairCosts) {
                const available = userSlots
                    .filter((s) => s.item_id === cost.item_id)
                    .reduce((sum, s) => sum + s.quantity, 0);
                if (available < cost.repair_qty) {
                    throw new Error(`Not enough ${cost.item_name}. Need ${cost.repair_qty}, have ${available}.`);
                }
            }

            // Deduct materials
            for (const cost of repairCosts) {
                let remaining = cost.repair_qty;
                const matchingSlots = userSlots
                    .filter((s) => s.item_id === cost.item_id && s.quantity > 0)
                    .sort((a, b) => a.quantity - b.quantity); // deduct from smallest stacks first

                for (const slot of matchingSlots) {
                    if (remaining <= 0) break;
                    const deduct = Math.min(remaining, slot.quantity);
                    remaining -= deduct;
                    slot.quantity -= deduct;

                    if (slot.quantity <= 0) {
                        await tx.inventorySlot.update({
                            where: { id: slot.id },
                            data: { item_id: null, quantity: 0, equipment_rarity: null },
                        });
                    } else {
                        await tx.inventorySlot.update({
                            where: { id: slot.id },
                            data: { quantity: slot.quantity },
                        });
                    }
                }
            }

            // Restore durability
            if (slotId) {
                await tx.$executeRaw`
                    UPDATE inventory_slots
                    SET equipment_durability = ${MAX_DURABILITY}
                    WHERE id = ${slotId}
                `;
            } else if (eqIdToUpdate) {
                await tx.$executeRaw`
                    UPDATE user_equipments
                    SET durability = ${MAX_DURABILITY}, durability_updated_at = NOW()
                    WHERE id = ${eqIdToUpdate}
                `;
            }
        });

        // Return updated state
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        const equipment = await getEquipmentState(req.userId!);

        res.json({
            message: "Equipment repaired to full durability!",
            slots,
            equipment,
        });
    } catch (error: any) {
        console.error("repairEquipment error:", error);
        const msg = error?.message ?? "Failed to repair equipment";
        res.status(400).json({ error: msg });
    }
};
