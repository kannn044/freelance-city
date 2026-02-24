import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { MAX_DURABILITY } from "../config/game.config";
import { getGameDurabilityDecayConfig, type GameDurabilityDecayConfig } from "./gamePricing.service";

type DbClient = Prisma.TransactionClient | typeof prisma;

let durabilityColumnsEnsured = false;

/**
 * Ensure the durability + durability_updated_at columns exist on user_equipments.
 * Uses the same pattern as ensureWorkOrderRarityColumn.
 */
export async function ensureDurabilityColumns() {
    if (durabilityColumnsEnsured) return;

    const durabilityCheck = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_equipments'
          AND COLUMN_NAME = 'durability'
    `;
    if (Number(durabilityCheck[0]?.cnt ?? 0) === 0) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE user_equipments
            ADD COLUMN durability DOUBLE NOT NULL DEFAULT 100
        `);
    }

    const updatedAtCheck = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_equipments'
          AND COLUMN_NAME = 'durability_updated_at'
    `;
    if (Number(updatedAtCheck[0]?.cnt ?? 0) === 0) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE user_equipments
            ADD COLUMN durability_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);
    }

    const inventoryDurabilityCheck = await prisma.$queryRaw<Array<{ cnt: number | bigint }>>`
        SELECT COUNT(*) as cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'inventory_slots'
          AND COLUMN_NAME = 'equipment_durability'
    `;
    if (Number(inventoryDurabilityCheck[0]?.cnt ?? 0) === 0) {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE inventory_slots
            ADD COLUMN equipment_durability DOUBLE NULL
        `);
    }

    durabilityColumnsEnsured = true;
}

interface EquipmentRow {
    id: number;
    slot: string;
    item_id: number | null;
    durability: number;
    durability_updated_at: Date;
}

interface ActiveOrderRow {
    type: string;
    started_at: Date;
    completes_at: Date;
    paused_at: Date | null;
    item_name: string | null;
}

/**
 * Sync (update) durability for all equipped items of a user.
 * Durability decays while work orders are actively running, per task type.
 * Called before reading equipment state.
 */
export async function syncDurability(userId: number, db: DbClient = prisma): Promise<void> {
    await ensureDurabilityColumns();

    const equipRows = await db.$queryRaw<EquipmentRow[]>`
        SELECT id, slot, item_id, durability, durability_updated_at
        FROM user_equipments
        WHERE user_id = ${userId}
          AND item_id IS NOT NULL
    `;

    if (equipRows.length === 0) return;

    const now = new Date();
    const nowMs = now.getTime();

    // Get active (not-collected, not-paused) work orders
    const orders = await db.$queryRaw<ActiveOrderRow[]>`
        SELECT w.type, w.started_at, w.completes_at, w.paused_at, i.name as item_name
        FROM work_orders w
        LEFT JOIN items i ON i.id = w.item_id
        WHERE w.user_id = ${userId}
          AND w.collected = false
    `;

    // Load decay config
    const decayConfig = await getGameDurabilityDecayConfig();

    for (const eq of equipRows) {
        if (Number(eq.durability) <= 0) {
            // Already broken — just touch updated_at to avoid repeated calculation
            if (eq.durability_updated_at.getTime() < nowMs - 60_000) {
                await db.$executeRaw`
                    UPDATE user_equipments
                    SET durability_updated_at = ${now}
                    WHERE id = ${eq.id}
                `;
            }
            continue;
        }

        const lastUpdatedMs = eq.durability_updated_at.getTime();
        if (nowMs <= lastUpdatedMs) continue;

        // Calculate total decay based on active tasks in the elapsed window
        let totalDecay = 0;

        for (const order of orders) {
            // Skip paused orders
            if (order.paused_at) continue;

            const orderStartMs = order.started_at.getTime();
            const orderEndMs = order.completes_at.getTime();

            // Overlap between [lastUpdatedMs, nowMs] and [orderStartMs, orderEndMs]
            const overlapStart = Math.max(lastUpdatedMs, orderStartMs);
            const overlapEnd = Math.min(nowMs, orderEndMs);
            if (overlapEnd <= overlapStart) continue;

            const overlapSec = (overlapEnd - overlapStart) / 1000;
            const dbType = String(order.type).toUpperCase();
            const itemName = String(order.item_name ?? "").toLowerCase();

            const orderType = dbType;

            let rate = 0;
            if (orderType === "FARM") rate = decayConfig.farm;
            else if (orderType === "COOK") rate = decayConfig.cook;
            else if (orderType === "MINE") rate = decayConfig.mine;
            else if (orderType === "SMELT") rate = decayConfig.smelt;

            totalDecay += overlapSec * rate;
        }

        if (totalDecay <= 0) {
            // No decay but still update timestamp
            await db.$executeRaw`
                UPDATE user_equipments
                SET durability_updated_at = ${now}
                WHERE id = ${eq.id}
            `;
            continue;
        }

        const newDurability = Math.max(0, Number(eq.durability) - totalDecay);

        await db.$executeRaw`
            UPDATE user_equipments
            SET durability = ${newDurability},
                durability_updated_at = ${now}
            WHERE id = ${eq.id}
        `;
    }
}
