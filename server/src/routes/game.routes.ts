import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getInventory, eatItem, equipItem, unequipItem, organizeInventory } from "../controllers/inventory.controller";
import { getWorkOrders, startWork, collectWork, collectReadyWork } from "../controllers/workspace.controller";
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
import { getProviderSkills, upgradeProviderSkill } from "../controllers/skills.controller";
import { getPricingConfig, setPricingConfig } from "../controllers/admin.controller";

const router = Router();

// All game routes require authentication
router.use(authMiddleware);

// ─── Player State ────────────────────────────────────
router.get("/inventory", getInventory);
router.post("/inventory/organize", organizeInventory);
router.post("/eat/:slotId", eatItem);
router.post("/equipment/equip", equipItem);
router.post("/equipment/unequip", unequipItem);

// ─── Workspace ───────────────────────────────────────
router.get("/workspace", getWorkOrders);
router.post("/workspace/start", startWork);
router.post("/workspace/collect/:orderId", collectWork);
router.post("/workspace/collect-ready", collectReadyWork);

// ─── Skills ──────────────────────────────────────────
router.get("/skills/provider", getProviderSkills);
router.post("/skills/provider/upgrade", upgradeProviderSkill);

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

// ─── Shop & Recipes ──────────────────────────────────
router.get("/shop", getShop);
router.post("/shop/buy", buyFromShop);
router.get("/shop/equipment-box", getEquipmentBoxInfo);
router.post("/shop/equipment-box/open", openEquipmentBox);
router.get("/shop/recipes", getRecipeShop);
router.post("/shop/recipes/buy", buyRecipeUnlock);
router.get("/recipes", getRecipes);

export default router;
