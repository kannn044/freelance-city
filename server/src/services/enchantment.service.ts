import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
    ENCHANT_SUCCESS_RATES,
    ENCHANT_FAILURE_DROP,
    ENCHANT_MILESTONES,
    ENCHANT_LEVEL_FLOOR,
    ENCHANT_DESTROY_ZONE_MIN,
    ENCHANT_DESTROY_CHANCE,
    ENCHANT_MAX_LEVEL,
    type EquipmentSlotKey,
} from "../../../shared/gameConfig";
import {
    getCityEnchantConfigForSlot,
    getMaterialForLevel,
    milestoneToStatKey,
    pickRandomStat,
    clearStatsAboveLevel,
} from "../../../shared/enchantmentUtils";

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface EnchantAttemptResult {
    success: boolean;
    newLevel: number;
    destroyed: boolean;
    specialStatAdded: string | null;
}

export interface EnchantPreviewResult {
    currentLevel: number;
    targetLevel: number;
    materialName: string;
    materialQty: number;
    goldCost: number;
    successRate: number;
    playerMaterialQty: number;
    playerGold: number;
    specialStats: (string | null)[];
    cityKey: string;
    workshopLabel: string;
}

async function deductMaterialFromInventory(
    userId: number,
    itemName: string,
    qty: number,
    db: DbClient
): Promise<void> {
    const item = await db.item.findUnique({ where: { name: itemName } });
    if (!item) throw new Error(`Material not found: ${itemName}`);

    const slots = await db.inventorySlot.findMany({
        where: { user_id: userId, item_id: item.id },
        orderBy: { slot: "asc" },
    });

    let remaining = qty;
    for (const slot of slots) {
        if (remaining <= 0) break;
        const take = Math.min(slot.quantity, remaining);
        remaining -= take;
        if (slot.quantity - take === 0) {
            await db.inventorySlot.update({
                where: { id: slot.id },
                data: { item_id: null, quantity: 0 },
            });
        } else {
            await db.inventorySlot.update({
                where: { id: slot.id },
                data: { quantity: slot.quantity - take },
            });
        }
    }

    if (remaining > 0) throw new Error(`Not enough ${itemName} (need ${qty})`);
}

async function countPlayerMaterial(userId: number, itemName: string, db: DbClient): Promise<number> {
    const item = await db.item.findUnique({ where: { name: itemName } });
    if (!item) return 0;
    const slots = await db.inventorySlot.findMany({
        where: { user_id: userId, item_id: item.id },
    });
    return slots.reduce((sum, s) => sum + s.quantity, 0);
}

export async function getEnchantPreview(
    userId: number,
    inventorySlotId: number,
    db: DbClient = prisma
): Promise<EnchantPreviewResult> {
    const slot = await db.inventorySlot.findFirstOrThrow({
        where: { id: inventorySlotId, user_id: userId },
    });

    if (!slot.item_id) throw new Error("Slot is empty");

    const item = await db.item.findUniqueOrThrow({ where: { id: slot.item_id } });
    if (!item.equipment_slot) throw new Error("Item is not equipment");

    const cfg = getCityEnchantConfigForSlot(item.equipment_slot as EquipmentSlotKey);
    if (!cfg) throw new Error("Item cannot be enchanted");

    const rawSlot = slot as any;
    const currentLevel: number = rawSlot.enchant_level ?? 0;
    const targetLevel = currentLevel + 1;
    if (targetLevel > ENCHANT_MAX_LEVEL) throw new Error("Already at maximum enchant level");

    const cost = cfg.materialCost[targetLevel];
    if (!cost) throw new Error("No cost defined for this enchant level");

    const materialName = getMaterialForLevel(cfg, targetLevel);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const playerMaterialQty = await countPlayerMaterial(userId, materialName, db);

    return {
        currentLevel,
        targetLevel,
        materialName,
        materialQty: cost.qty,
        goldCost: cost.gold,
        successRate: ENCHANT_SUCCESS_RATES[targetLevel] ?? 0,
        playerMaterialQty,
        playerGold: user.money,
        specialStats: [rawSlot.special_stat_1 ?? null, rawSlot.special_stat_2 ?? null, rawSlot.special_stat_3 ?? null, rawSlot.special_stat_4 ?? null],
        cityKey: cfg.cityKey,
        workshopLabel: cfg.workshopLabel,
    };
}

export async function attemptEnchant(
    userId: number,
    inventorySlotId: number,
    db: DbClient = prisma
): Promise<EnchantAttemptResult> {
    return (db as typeof prisma).$transaction(async (tx) => {
        // 1. Load slot — must belong to user
        const slot = await tx.inventorySlot.findFirstOrThrow({
            where: { id: inventorySlotId, user_id: userId },
        });

        if (!slot.item_id) throw new Error("Slot is empty");

        const item = await tx.item.findUniqueOrThrow({ where: { id: slot.item_id } });
        if (!item.equipment_slot) throw new Error("Item is not equipment");

        // 2. Resolve city config from equipment slot
        const cfg = getCityEnchantConfigForSlot(item.equipment_slot as EquipmentSlotKey);
        if (!cfg) throw new Error("Item slot is not enchantable");

        // 3. Validate player is in the correct city
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const playerCity = (user as any).city_key?.toLowerCase() ?? "";
        if (playerCity !== cfg.cityKey.toLowerCase()) {
            throw new Error(`Must be in ${cfg.workshopLabel} to enchant this item`);
        }

        const rawSlot = slot as any;
        const currentLevel: number = rawSlot.enchant_level ?? 0;
        const targetLevel = currentLevel + 1;
        if (targetLevel > ENCHANT_MAX_LEVEL) throw new Error("Already at maximum enchant level +12");

        // 4. Deduct material + gold
        const cost = cfg.materialCost[targetLevel];
        if (!cost) throw new Error("No cost defined for this enchant level");

        const materialName = getMaterialForLevel(cfg, targetLevel);
        await deductMaterialFromInventory(userId, materialName, cost.qty, tx as any);
        await tx.user.update({
            where: { id: userId },
            data: { money: { decrement: cost.gold } },
        });

        // Verify user has enough money (check was done in preview, but verify in tx)
        const updatedUser = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (updatedUser.money < 0) throw new Error("Not enough gold");

        // 5. Roll success
        const success = Math.random() < (ENCHANT_SUCCESS_RATES[targetLevel] ?? 0);

        if (success) {
            const newLevel = targetLevel;
            let specialStatAdded: string | null = null;

            const statUpdate: Record<string, string | null> = {};
            if ((ENCHANT_MILESTONES as readonly number[]).includes(newLevel)) {
                const existing = [
                    rawSlot.special_stat_1,
                    rawSlot.special_stat_2,
                    rawSlot.special_stat_3,
                    rawSlot.special_stat_4,
                ].filter(Boolean) as string[];
                specialStatAdded = pickRandomStat(cfg.specialStatPool, existing);
                if (specialStatAdded) {
                    statUpdate[milestoneToStatKey(newLevel)] = specialStatAdded;
                }
            }

            await tx.$executeRaw`
                UPDATE inventory_slots
                SET enchant_level = ${newLevel},
                    special_stat_1 = ${(statUpdate["special_stat_1"] !== undefined ? statUpdate["special_stat_1"] : rawSlot.special_stat_1) ?? null},
                    special_stat_2 = ${(statUpdate["special_stat_2"] !== undefined ? statUpdate["special_stat_2"] : rawSlot.special_stat_2) ?? null},
                    special_stat_3 = ${(statUpdate["special_stat_3"] !== undefined ? statUpdate["special_stat_3"] : rawSlot.special_stat_3) ?? null},
                    special_stat_4 = ${(statUpdate["special_stat_4"] !== undefined ? statUpdate["special_stat_4"] : rawSlot.special_stat_4) ?? null}
                WHERE id = ${inventorySlotId}
            `;

            return { success: true, newLevel, specialStatAdded, destroyed: false };

        } else {
            // 6. Failure resolution
            const drop = ENCHANT_FAILURE_DROP[targetLevel] ?? 1;
            const rawNewLevel = currentLevel - drop;
            const newLevel = Math.max(rawNewLevel, ENCHANT_LEVEL_FLOOR);

            const inDestroyZone = currentLevel >= ENCHANT_DESTROY_ZONE_MIN;
            const destroyed = inDestroyZone && Math.random() < ENCHANT_DESTROY_CHANCE;

            if (destroyed) {
                await tx.inventorySlot.update({
                    where: { id: inventorySlotId },
                    data: { item_id: null, quantity: 0 },
                });
                await tx.$executeRaw`
                    UPDATE inventory_slots
                    SET enchant_level = 0,
                        special_stat_1 = NULL,
                        special_stat_2 = NULL,
                        special_stat_3 = NULL,
                        special_stat_4 = NULL
                    WHERE id = ${inventorySlotId}
                `;
                return { success: false, newLevel: 0, destroyed: true, specialStatAdded: null };
            }

            // Clear stats for milestones above new level
            const clearedStats = clearStatsAboveLevel(rawSlot, newLevel);
            const s1 = clearedStats["special_stat_1"] !== undefined ? null : (rawSlot.special_stat_1 ?? null);
            const s2 = clearedStats["special_stat_2"] !== undefined ? null : (rawSlot.special_stat_2 ?? null);
            const s3 = clearedStats["special_stat_3"] !== undefined ? null : (rawSlot.special_stat_3 ?? null);
            const s4 = clearedStats["special_stat_4"] !== undefined ? null : (rawSlot.special_stat_4 ?? null);

            await tx.$executeRaw`
                UPDATE inventory_slots
                SET enchant_level = ${newLevel},
                    special_stat_1 = ${s1},
                    special_stat_2 = ${s2},
                    special_stat_3 = ${s3},
                    special_stat_4 = ${s4}
                WHERE id = ${inventorySlotId}
            `;

            return { success: false, newLevel, destroyed: false, specialStatAdded: null };
        }
    });
}
