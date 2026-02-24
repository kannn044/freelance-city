import { syncDurability } from "./src/services/durability.service";
import { prisma } from "./src/lib/prisma";

async function run() {
    const activeEqs = await prisma.$queryRaw<any[]>`
        SELECT id, user_id, slot, item_id, durability, durability_updated_at 
        FROM user_equipments WHERE item_id IS NOT NULL
    `;
    console.log(`Active equipments:`, activeEqs);

    const userIds = Array.from(new Set(activeEqs.map(e => e.user_id)));
    for (const userId of userIds) {
        console.log(`Syncing user ${userId}...`);
        await syncDurability(userId);

        const eq = await prisma.$queryRaw`
            SELECT id, slot, item_id, durability, durability_updated_at 
            FROM user_equipments WHERE user_id=${userId} AND item_id IS NOT NULL
        `;
        console.log(`User ${userId} equipment after sync:`, eq);
    }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
