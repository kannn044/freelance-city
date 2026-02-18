import { Request, Response } from "express";
import {
    getFerrumMiningConfig,
    getGamePricing,
    getGameRuntimeConfig,
    getGameTaskDecayConfig,
    getGameTaskTimeConfig,
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
        const taskTime = await getGameTaskTimeConfig();
        const ferrumMining = await getFerrumMiningConfig();
        res.json({ taskDecay, taskTime, ferrumMining });
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
 *   cookPerMenu?: number,
 *   providerTaskTimeMultiplier?: number,
 *   chefTaskTimeMultiplier?: number,
 *   providerWorkExpMultiplier?: number,
 *   chefWorkExpMultiplier?: number,
 *   providerMarketExpMultiplier?: number,
 *   chefMarketExpMultiplier?: number,
 *   harvestNormalRate?: number,
 *   harvestRareRate?: number,
 *   harvestEpicRate?: number,
 *   harvestLegendaryRate?: number,
 *   equipmentNormalRate?: number,
 *   equipmentRareRate?: number,
 *   equipmentEpicRate?: number,
 *   equipmentLegendaryRate?: number,
 *   ferrumMiningHungerCost?: number,
 *   ferrumMiningTimeSurface?: number,
 *   ferrumMiningTimeDeep?: number,
 *   ferrumMiningTimeCore?: number
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
            || payload.cookPerMenu != null
            || payload.providerTaskTimeMultiplier != null
            || payload.chefTaskTimeMultiplier != null
            || payload.providerWorkExpMultiplier != null
            || payload.chefWorkExpMultiplier != null
            || payload.providerMarketExpMultiplier != null
            || payload.chefMarketExpMultiplier != null
            || payload.harvestNormalRate != null
            || payload.harvestRareRate != null
            || payload.harvestEpicRate != null
            || payload.harvestLegendaryRate != null
            || payload.equipmentNormalRate != null
            || payload.equipmentRareRate != null
            || payload.equipmentEpicRate != null
            || payload.equipmentLegendaryRate != null
            || payload.ferrumMiningHungerCost != null
            || payload.ferrumMiningTimeSurface != null
            || payload.ferrumMiningTimeDeep != null
            || payload.ferrumMiningTimeCore != null
            || payload.ferrumDropSurfaceIron != null
            || payload.ferrumDropSurfaceCopper != null
            || payload.ferrumDropSurfaceSteel != null
            || payload.ferrumDropSurfaceStone != null
            || payload.ferrumDropSurfaceCoal != null
            || payload.ferrumDropSurfaceGem != null
            || payload.ferrumDropDeepIron != null
            || payload.ferrumDropDeepCopper != null
            || payload.ferrumDropDeepSteel != null
            || payload.ferrumDropDeepStone != null
            || payload.ferrumDropDeepCoal != null
            || payload.ferrumDropDeepGem != null
            || payload.ferrumDropCoreIron != null
            || payload.ferrumDropCoreCopper != null
            || payload.ferrumDropCoreSteel != null
            || payload.ferrumDropCoreStone != null
            || payload.ferrumDropCoreCoal != null
            || payload.ferrumDropCoreGem != null;

        if (!hasAny) {
            res.status(400).json({ error: "No runtime config fields provided" });
            return;
        }

        const runtime = await updateGameRuntimeConfig({
            npcShopMultiplier: payload.npcShopMultiplier != null ? Number(payload.npcShopMultiplier) : undefined,
            equipmentBoxPrice: payload.equipmentBoxPrice != null ? Number(payload.equipmentBoxPrice) : undefined,
            farmPerPlot: payload.farmPerPlot != null ? Number(payload.farmPerPlot) : undefined,
            cookPerMenu: payload.cookPerMenu != null ? Number(payload.cookPerMenu) : undefined,
            providerTaskTimeMultiplier: payload.providerTaskTimeMultiplier != null ? Number(payload.providerTaskTimeMultiplier) : undefined,
            chefTaskTimeMultiplier: payload.chefTaskTimeMultiplier != null ? Number(payload.chefTaskTimeMultiplier) : undefined,
            providerWorkExpMultiplier: payload.providerWorkExpMultiplier != null ? Number(payload.providerWorkExpMultiplier) : undefined,
            chefWorkExpMultiplier: payload.chefWorkExpMultiplier != null ? Number(payload.chefWorkExpMultiplier) : undefined,
            providerMarketExpMultiplier: payload.providerMarketExpMultiplier != null ? Number(payload.providerMarketExpMultiplier) : undefined,
            chefMarketExpMultiplier: payload.chefMarketExpMultiplier != null ? Number(payload.chefMarketExpMultiplier) : undefined,
            harvestNormalRate: payload.harvestNormalRate != null ? Number(payload.harvestNormalRate) : undefined,
            harvestRareRate: payload.harvestRareRate != null ? Number(payload.harvestRareRate) : undefined,
            harvestEpicRate: payload.harvestEpicRate != null ? Number(payload.harvestEpicRate) : undefined,
            harvestLegendaryRate: payload.harvestLegendaryRate != null ? Number(payload.harvestLegendaryRate) : undefined,
            equipmentNormalRate: payload.equipmentNormalRate != null ? Number(payload.equipmentNormalRate) : undefined,
            equipmentRareRate: payload.equipmentRareRate != null ? Number(payload.equipmentRareRate) : undefined,
            equipmentEpicRate: payload.equipmentEpicRate != null ? Number(payload.equipmentEpicRate) : undefined,
            equipmentLegendaryRate: payload.equipmentLegendaryRate != null ? Number(payload.equipmentLegendaryRate) : undefined,
            ferrumMiningHungerCost: payload.ferrumMiningHungerCost != null ? Number(payload.ferrumMiningHungerCost) : undefined,
            ferrumMiningTimeSurface: payload.ferrumMiningTimeSurface != null ? Number(payload.ferrumMiningTimeSurface) : undefined,
            ferrumMiningTimeDeep: payload.ferrumMiningTimeDeep != null ? Number(payload.ferrumMiningTimeDeep) : undefined,
            ferrumMiningTimeCore: payload.ferrumMiningTimeCore != null ? Number(payload.ferrumMiningTimeCore) : undefined,
            ferrumDropSurfaceIron: payload.ferrumDropSurfaceIron != null ? Number(payload.ferrumDropSurfaceIron) : undefined,
            ferrumDropSurfaceCopper: payload.ferrumDropSurfaceCopper != null ? Number(payload.ferrumDropSurfaceCopper) : undefined,
            ferrumDropSurfaceSteel: payload.ferrumDropSurfaceSteel != null ? Number(payload.ferrumDropSurfaceSteel) : undefined,
            ferrumDropSurfaceStone: payload.ferrumDropSurfaceStone != null ? Number(payload.ferrumDropSurfaceStone) : undefined,
            ferrumDropSurfaceCoal: payload.ferrumDropSurfaceCoal != null ? Number(payload.ferrumDropSurfaceCoal) : undefined,
            ferrumDropSurfaceGem: payload.ferrumDropSurfaceGem != null ? Number(payload.ferrumDropSurfaceGem) : undefined,
            ferrumDropDeepIron: payload.ferrumDropDeepIron != null ? Number(payload.ferrumDropDeepIron) : undefined,
            ferrumDropDeepCopper: payload.ferrumDropDeepCopper != null ? Number(payload.ferrumDropDeepCopper) : undefined,
            ferrumDropDeepSteel: payload.ferrumDropDeepSteel != null ? Number(payload.ferrumDropDeepSteel) : undefined,
            ferrumDropDeepStone: payload.ferrumDropDeepStone != null ? Number(payload.ferrumDropDeepStone) : undefined,
            ferrumDropDeepCoal: payload.ferrumDropDeepCoal != null ? Number(payload.ferrumDropDeepCoal) : undefined,
            ferrumDropDeepGem: payload.ferrumDropDeepGem != null ? Number(payload.ferrumDropDeepGem) : undefined,
            ferrumDropCoreIron: payload.ferrumDropCoreIron != null ? Number(payload.ferrumDropCoreIron) : undefined,
            ferrumDropCoreCopper: payload.ferrumDropCoreCopper != null ? Number(payload.ferrumDropCoreCopper) : undefined,
            ferrumDropCoreSteel: payload.ferrumDropCoreSteel != null ? Number(payload.ferrumDropCoreSteel) : undefined,
            ferrumDropCoreStone: payload.ferrumDropCoreStone != null ? Number(payload.ferrumDropCoreStone) : undefined,
            ferrumDropCoreCoal: payload.ferrumDropCoreCoal != null ? Number(payload.ferrumDropCoreCoal) : undefined,
            ferrumDropCoreGem: payload.ferrumDropCoreGem != null ? Number(payload.ferrumDropCoreGem) : undefined,
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
