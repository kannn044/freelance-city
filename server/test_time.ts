console.log('JS Date:', new Date());
import { prisma } from "./src/lib/prisma";
async function run() {
    const dbNow = await prisma.$queryRaw<any[]>`SELECT NOW() as now`;
    console.log('DB NOW():', dbNow[0].now);
}
run().then(() => process.exit(0));
