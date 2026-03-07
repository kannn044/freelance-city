import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getInventory, eatItem, equipItem, unequipItem, organizeInventory, discardItem, getRepairCost, repairEquipment } from "../controllers/inventory.controller";
import { getWorkOrders, startWork, collectWork, collectReadyWork, cancelWork } from "../controllers/workspace.controller";
import {
	getListings,
	createListing,
	buyListing,
	cancelListing,
	getSalesHistory,
	getMarketBotConfig,
	updateMarketBotConfig,
	runMarketBotTick,
} from "../controllers/market.controller";
import {
	getShop,
	buyFromShop,
	getRecipes,
	getRecipeShop,
	buyRecipeUnlock,
	getEquipmentBoxInfo,
	openEquipmentBox,
} from "../controllers/shop.controller";
import {
	getFirstJobSkills,
	upgradeFirstJobSkill,
	getSecondaryJobSkills,
	upgradeSecondaryJobSkill,
} from "../controllers/skills.controller";
import {
	getPricingConfig,
	setPricingConfig,
	getPublicRuntimeConfig,
	getRuntimeConfig,
	setRuntimeConfig,
} from "../controllers/admin.controller";
import {
	getCityGovernanceController,
	setCityTaxesController,
	voteMayorController,
} from "../controllers/city.controller";
import { getDailyQuests, submitQuest } from "../controllers/quest.controller";

const router = Router();

// All game routes require authentication
router.use(authMiddleware);

// ─── Player State ────────────────────────────────────
router.get("/inventory", getInventory);
router.post("/inventory/organize", organizeInventory);
router.post("/inventory/discard", discardItem);
router.post("/eat/:slotId", eatItem);
router.post("/equipment/equip", equipItem);
router.post("/equipment/unequip", unequipItem);
router.get("/equipment/repair-cost", getRepairCost);
router.post("/equipment/repair", repairEquipment);

// ─── Workspace ───────────────────────────────────────
router.get("/workspace", getWorkOrders);
router.post("/workspace/start", startWork);
router.post("/workspace/collect/:orderId", collectWork);
router.post("/workspace/collect-ready", collectReadyWork);
router.post("/workspace/cancel/:orderId", cancelWork);

// ─── Skills ──────────────────────────────────────────
router.get("/skills/first-job", getFirstJobSkills);
router.post("/skills/first-job/upgrade", upgradeFirstJobSkill);
router.get("/skills/secondary-job", getSecondaryJobSkills);
router.post("/skills/secondary-job/upgrade", upgradeSecondaryJobSkill);

// ─── Market ──────────────────────────────────────────
router.get("/market", getListings);
router.get("/market/sales-history", getSalesHistory);
router.post("/market/sell", createListing);
router.post("/market/buy/:listingId", buyListing);
router.post("/market/cancel/:listingId", cancelListing);
router.get("/market/bot/config", getMarketBotConfig);
router.post("/market/bot/config", updateMarketBotConfig);
router.post("/market/bot/tick", runMarketBotTick);

// ─── Admin ───────────────────────────────────────────
router.get("/admin/pricing", getPricingConfig);
router.post("/admin/pricing", setPricingConfig);
router.get("/runtime-config", getPublicRuntimeConfig);
router.get("/admin/runtime-config", getRuntimeConfig);
router.post("/admin/runtime-config", setRuntimeConfig);

// ─── City Governance ──────────────────────────────────
router.get("/city/governance", getCityGovernanceController);
router.post("/city/vote-mayor", voteMayorController);
router.post("/city/taxes", setCityTaxesController);

// ─── Shop & Recipes ──────────────────────────────────
router.get("/shop", getShop);
router.post("/shop/buy", buyFromShop);
router.get("/shop/equipment-box", getEquipmentBoxInfo);
router.post("/shop/equipment-box/open", openEquipmentBox);
router.get("/shop/recipes", getRecipeShop);
router.post("/shop/recipes/buy", buyRecipeUnlock);
router.get("/recipes", getRecipes);

// ─── Daily Quests ────────────────────────────────────
router.get("/quests", getDailyQuests);
router.post("/quests/submit/:questId", submitQuest);

export default router;
