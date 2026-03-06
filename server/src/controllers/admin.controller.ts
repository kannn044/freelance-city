import { Request, Response } from "express";
import {
    getFerrumMiningConfig,
    getGameDurabilityDecayConfig,
    getGamePricing,
    getGameRuntimeConfig,
    getGameTaskDecayConfig,
    getGameTaskTimeConfig,
    updateGamePricing,
    updateGameRuntimeConfig,
} from "../services/gamePricing.service";
import { syncHunger } from "../services/hunger.service";
import { getUserEquipmentEffects } from "../services/equipmentEffects.service";
import { getHungerTier, getSecondaryJobSkillCookTimeReduction, HUNGER_TIERS } from "../config/game.config";
import { prisma } from "../lib/prisma";

interface AuthRequest extends Request {
    userId?: number;
}

function isAdminAuthorized(req: Request): boolean {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return false;
    const headerKey = String(req.headers["x-admin-key"] ?? "");
    return headerKey.length > 0 && headerKey === adminSecret;
}

function applyTierReduction(baseHunger: number, tierReduction: number) {
    const baseTier = getHungerTier(baseHunger);
    const idx = HUNGER_TIERS.findIndex((t) => t.state === baseTier.state);
    if (idx < 0 || tierReduction <= 0) return baseTier;
    const reducedIdx = Math.max(0, idx - Math.floor(tierReduction));
    return HUNGER_TIERS[reducedIdx];
}

async function getJobBranchLevels(userId: number, jobSlot: "first_job" | "secondary_job") {
    const rows = await prisma.$queryRaw<Array<{ branch_slot: number; level: number }>>`
        SELECT b.branch_slot,
               COALESCE(usp.level, 0) as level
        FROM user_job_progress ujp
        JOIN occupation_skill_branch_catalog b
          ON b.occupation_key = ujp.occupation_key
        LEFT JOIN user_skill_progress usp
          ON usp.user_id = ujp.user_id
         AND usp.job_slot = ujp.job_slot
         AND usp.branch_key = b.branch_key
        WHERE ujp.user_id = ${userId}
          AND ujp.job_slot = ${jobSlot}
        ORDER BY b.branch_slot ASC
    `;
    if (rows.length <= 0) return { branch1: 0, branch2: 0, branch3: 0 };
    const bySlot = new Map<number, number>();
    for (const row of rows) {
        bySlot.set(Number(row.branch_slot ?? 0), Number(row.level ?? 0));
    }
    return {
        branch1: Number(bySlot.get(1) ?? 0),
        branch2: Number(bySlot.get(2) ?? 0),
        branch3: Number(bySlot.get(3) ?? 0),
    };
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
 * Returns effective layer times factoring in the user's hunger, equipment, and skill levels.
 */
export async function getPublicRuntimeConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
        const [taskDecay, taskTime, ferrumMining, durabilityDecay] = await Promise.all([
            getGameTaskDecayConfig(),
            getGameTaskTimeConfig(),
            getFerrumMiningConfig(),
            getGameDurabilityDecayConfig(),
        ]);

        // Compute effective layer times for this user
        let effectiveLayerTimeMins = { ...ferrumMining.layerTimeMins };
        const userId = req.userId;
        if (userId) {
            try {
                const user = await syncHunger(userId);
                const equipmentEffects = await getUserEquipmentEffects(userId);
                const firstJobBranchLevels = await getJobBranchLevels(userId, "first_job");
                const minerPrepLevel = Number(firstJobBranchLevels.branch1 ?? 0);
                const minerTimeReduction = getSecondaryJobSkillCookTimeReduction(minerPrepLevel);
                const tier = applyTierReduction(user.hunger, equipmentEffects.hungerPenaltyTierReduction);
                const multiplier = tier.multiplier * (1 - minerTimeReduction) * taskTime.firstJobTaskTimeMultiplier;

                effectiveLayerTimeMins = {
                    surface: Math.ceil(ferrumMining.layerTimeMins.surface * multiplier),
                    deep: Math.ceil(ferrumMining.layerTimeMins.deep * multiplier),
                    core: Math.ceil(ferrumMining.layerTimeMins.core * multiplier),
                };
            } catch (e) {
                // fallback to base config times
            }
        }

        res.json({
            taskDecay,
            taskTime,
            durabilityDecay,
            ferrumMining: {
                ...ferrumMining,
                effectiveLayerTimeMins,
            },
        });
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
 *   firstJobTaskTimeMultiplier?: number,
 *   secondaryJobTaskTimeMultiplier?: number,
 *   firstJobWorkExpMultiplier?: number,
 *   secondaryJobWorkExpMultiplier?: number,
 *   firstJobMarketExpMultiplier?: number,
 *   secondaryJobMarketExpMultiplier?: number,
 *   providerTaskTimeMultiplier?: number,      // legacy alias
 *   chefTaskTimeMultiplier?: number,          // legacy alias
 *   providerWorkExpMultiplier?: number,       // legacy alias
 *   chefWorkExpMultiplier?: number,           // legacy alias
 *   providerMarketExpMultiplier?: number,     // legacy alias
 *   chefMarketExpMultiplier?: number,         // legacy alias
 *   harvestNormalRate?: number,
 *   harvestRareRate?: number,
 *   harvestEpicRate?: number,
 *   harvestLegendaryRate?: number,
 *   equipmentNormalRate?: number,
 *   equipmentRareRate?: number,
 *   equipmentEpicRate?: number,
 *   equipmentLegendaryRate?: number,
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
            || payload.firstJobTaskTimeMultiplier != null
            || payload.secondaryJobTaskTimeMultiplier != null
            || payload.providerTaskTimeMultiplier != null
            || payload.chefTaskTimeMultiplier != null
            || payload.providerWorkExpMultiplier != null
            || payload.chefWorkExpMultiplier != null
            || payload.providerMarketExpMultiplier != null
            || payload.chefMarketExpMultiplier != null
            || payload.firstJobWorkExpMultiplier != null
            || payload.secondaryJobWorkExpMultiplier != null
            || payload.firstJobMarketExpMultiplier != null
            || payload.secondaryJobMarketExpMultiplier != null
            || payload.harvestNormalRate != null
            || payload.harvestRareRate != null
            || payload.harvestEpicRate != null
            || payload.harvestLegendaryRate != null
            || payload.equipmentNormalRate != null
            || payload.equipmentRareRate != null
            || payload.equipmentEpicRate != null
            || payload.equipmentLegendaryRate != null
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
            firstJobTaskTimeMultiplier: payload.firstJobTaskTimeMultiplier != null ? Number(payload.firstJobTaskTimeMultiplier) : undefined,
            secondaryJobTaskTimeMultiplier: payload.secondaryJobTaskTimeMultiplier != null ? Number(payload.secondaryJobTaskTimeMultiplier) : undefined,
            providerTaskTimeMultiplier: payload.providerTaskTimeMultiplier != null ? Number(payload.providerTaskTimeMultiplier) : undefined,
            chefTaskTimeMultiplier: payload.chefTaskTimeMultiplier != null ? Number(payload.chefTaskTimeMultiplier) : undefined,
            providerWorkExpMultiplier: payload.providerWorkExpMultiplier != null ? Number(payload.providerWorkExpMultiplier) : undefined,
            chefWorkExpMultiplier: payload.chefWorkExpMultiplier != null ? Number(payload.chefWorkExpMultiplier) : undefined,
            providerMarketExpMultiplier: payload.providerMarketExpMultiplier != null ? Number(payload.providerMarketExpMultiplier) : undefined,
            chefMarketExpMultiplier: payload.chefMarketExpMultiplier != null ? Number(payload.chefMarketExpMultiplier) : undefined,
            firstJobWorkExpMultiplier: payload.firstJobWorkExpMultiplier != null ? Number(payload.firstJobWorkExpMultiplier) : undefined,
            secondaryJobWorkExpMultiplier: payload.secondaryJobWorkExpMultiplier != null ? Number(payload.secondaryJobWorkExpMultiplier) : undefined,
            firstJobMarketExpMultiplier: payload.firstJobMarketExpMultiplier != null ? Number(payload.firstJobMarketExpMultiplier) : undefined,
            secondaryJobMarketExpMultiplier: payload.secondaryJobMarketExpMultiplier != null ? Number(payload.secondaryJobMarketExpMultiplier) : undefined,
            harvestNormalRate: payload.harvestNormalRate != null ? Number(payload.harvestNormalRate) : undefined,
            harvestRareRate: payload.harvestRareRate != null ? Number(payload.harvestRareRate) : undefined,
            harvestEpicRate: payload.harvestEpicRate != null ? Number(payload.harvestEpicRate) : undefined,
            harvestLegendaryRate: payload.harvestLegendaryRate != null ? Number(payload.harvestLegendaryRate) : undefined,
            equipmentNormalRate: payload.equipmentNormalRate != null ? Number(payload.equipmentNormalRate) : undefined,
            equipmentRareRate: payload.equipmentRareRate != null ? Number(payload.equipmentRareRate) : undefined,
            equipmentEpicRate: payload.equipmentEpicRate != null ? Number(payload.equipmentEpicRate) : undefined,
            equipmentLegendaryRate: payload.equipmentLegendaryRate != null ? Number(payload.equipmentLegendaryRate) : undefined,
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
