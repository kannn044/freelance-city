import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getInventory, eatItem, equipItem, unequipItem } from "../controllers/inventory.controller";
import { getWorkOrders, startWork, collectWork, collectReadyWork } from "../controllers/workspace.controller";
import { getListings, createListing, buyListing } from "../controllers/market.controller";
import {
	getShop,
	buyFromShop,
	getRecipes,
	getRecipeShop,
	buyRecipeUnlock,
	getEquipmentBoxInfo,
	openEquipmentBox,
} from "../controllers/shop.controller";

const router = Router();

// All game routes require authentication
router.use(authMiddleware);

// ─── Player State ────────────────────────────────────
router.get("/inventory", getInventory);
router.post("/eat/:slotId", eatItem);
router.post("/equipment/equip", equipItem);
router.post("/equipment/unequip", unequipItem);

// ─── Workspace ───────────────────────────────────────
router.get("/workspace", getWorkOrders);
router.post("/workspace/start", startWork);
router.post("/workspace/collect/:orderId", collectWork);
router.post("/workspace/collect-ready", collectReadyWork);

// ─── Market ──────────────────────────────────────────
router.get("/market", getListings);
router.post("/market/sell", createListing);
router.post("/market/buy/:listingId", buyListing);

// ─── Shop & Recipes ──────────────────────────────────
router.get("/shop", getShop);
router.post("/shop/buy", buyFromShop);
router.get("/shop/equipment-box", getEquipmentBoxInfo);
router.post("/shop/equipment-box/open", openEquipmentBox);
router.get("/shop/recipes", getRecipeShop);
router.post("/shop/recipes/buy", buyRecipeUnlock);
router.get("/recipes", getRecipes);

export default router;
