import { Request, Response } from "express";
import {
    getGamePricing,
    getGameRuntimeConfig,
    getGameTaskDecayConfig,
    updateGamePricing,
    updateGameRuntimeConfig,
} from "../services/gamePricing.service";

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

/**
 * GET /game/runtime-config
 * Public (authenticated) runtime config needed by gameplay UI.
 */
export async function getPublicRuntimeConfig(_req: AuthRequest, res: Response): Promise<void> {
    try {
        const taskDecay = await getGameTaskDecayConfig();
        res.json({ taskDecay });
    } catch (error) {
        console.error("getPublicRuntimeConfig error:", error);
        res.status(500).json({ error: "Failed to fetch runtime config" });
    }
}

/**
 * GET /game/admin/runtime-config
 */
export async function getRuntimeConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!isAdminAuthorized(req)) {
            res.status(403).json({ error: "Admin access denied" });
            return;
        }

        const runtime = await getGameRuntimeConfig();
        res.json({ runtime });
    } catch (error) {
        console.error("getRuntimeConfig error:", error);
        res.status(500).json({ error: "Failed to fetch runtime config" });
    }
}

/**
 * POST /game/admin/runtime-config
 * Body: {
 *   npcShopMultiplier?: number,
 *   equipmentBoxPrice?: number,
 *   farmPerPlot?: number,
 *   cookPerMenu?: number
 * }
 */
export async function setRuntimeConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!isAdminAuthorized(req)) {
            res.status(403).json({ error: "Admin access denied" });
            return;
        }

        const payload = req.body ?? {};
        const hasAny =
            payload.npcShopMultiplier != null
            || payload.equipmentBoxPrice != null
            || payload.farmPerPlot != null
            || payload.cookPerMenu != null;

        if (!hasAny) {
            res.status(400).json({ error: "No runtime config fields provided" });
            return;
        }

        const runtime = await updateGameRuntimeConfig({
            npcShopMultiplier: payload.npcShopMultiplier != null ? Number(payload.npcShopMultiplier) : undefined,
            equipmentBoxPrice: payload.equipmentBoxPrice != null ? Number(payload.equipmentBoxPrice) : undefined,
            farmPerPlot: payload.farmPerPlot != null ? Number(payload.farmPerPlot) : undefined,
            cookPerMenu: payload.cookPerMenu != null ? Number(payload.cookPerMenu) : undefined,
        });

        res.json({
            message: "Runtime config updated",
            runtime,
        });
    } catch (error) {
        console.error("setRuntimeConfig error:", error);
        res.status(500).json({ error: "Failed to update runtime config" });
    }
}
