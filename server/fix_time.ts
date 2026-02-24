import { prisma } from "./src/lib/prisma";

async function run() {
    const now = new Date();
    await prisma.$executeRaw`
        UPDATE user_equipments
        SET durability_updated_at = ${now}
        WHERE durability_updated_at > ${now}
    `;
    console.log('Fixed future timestamps.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
