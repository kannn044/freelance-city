import { Request, Response } from "express";
import { getGamePricing, updateGamePricing } from "../services/gamePricing.service";

interface AuthRequest extends Request {
    userId?: number;
}

function isAdminAuthorized(req: Request): boolean {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return false;
    const headerKey = String(req.headers["x-admin-key"] ?? "");
    return headerKey.length > 0 && headerKey === adminSecret;
}

/**
 * GET /game/admin/pricing
 */
export async function getPricingConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!isAdminAuthorized(req)) {
            res.status(403).json({ error: "Admin access denied" });
            return;
        }

        const pricing = await getGamePricing();
        res.json({ pricing });
    } catch (error) {
        console.error("getPricingConfig error:", error);
        res.status(500).json({ error: "Failed to fetch pricing config" });
    }
}

/**
 * POST /game/admin/pricing
 * Body: { npcShopMultiplier?: number, equipmentBoxPrice?: number }
 */
export async function setPricingConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!isAdminAuthorized(req)) {
            res.status(403).json({ error: "Admin access denied" });
            return;
        }

        const payload = req.body ?? {};
        const hasNpc = payload.npcShopMultiplier != null;
        const hasBox = payload.equipmentBoxPrice != null;

        if (!hasNpc && !hasBox) {
            res.status(400).json({ error: "No pricing fields provided" });
            return;
        }

        const next = await updateGamePricing({
            npcShopMultiplier: hasNpc ? Number(payload.npcShopMultiplier) : undefined,
            equipmentBoxPrice: hasBox ? Number(payload.equipmentBoxPrice) : undefined,
        });

        res.json({
            message: "Pricing updated",
            pricing: next,
        });
    } catch (error) {
        console.error("setPricingConfig error:", error);
        res.status(500).json({ error: "Failed to update pricing config" });
    }
}
