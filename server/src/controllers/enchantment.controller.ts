import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { attemptEnchant, getEnchantPreview } from "../services/enchantment.service";
import { CITY_ENCHANT_CONFIGS } from "../../../shared/gameConfig";

interface AuthRequest extends Request {
    userId?: number;
}

export async function attemptEnchantController(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { inventorySlotId } = req.body;
    if (!inventorySlotId || typeof inventorySlotId !== "number") {
        res.status(400).json({ error: "inventorySlotId (number) is required" });
        return;
    }

    try {
        const result = await attemptEnchant(userId, inventorySlotId, prisma);
        res.json({ ok: true, ...result });
    } catch (err: any) {
        res.status(400).json({ ok: false, error: err.message ?? "Enchant attempt failed" });
    }
}

export async function getEnchantPreviewController(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const slotId = parseInt(String(req.params.slotId ?? ""), 10);
    if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slotId" }); return; }

    try {
        const preview = await getEnchantPreview(userId, slotId, prisma);
        res.json({ ok: true, ...preview });
    } catch (err: any) {
        res.status(400).json({ ok: false, error: err.message ?? "Preview failed" });
    }
}

export async function getEnchantConfigsController(_req: AuthRequest, res: Response): Promise<void> {
    res.json({ ok: true, configs: CITY_ENCHANT_CONFIGS });
}
