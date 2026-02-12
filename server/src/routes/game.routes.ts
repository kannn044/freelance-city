import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getInventory, eatItem } from "../controllers/inventory.controller";
import { getWorkOrders, startWork, collectWork } from "../controllers/workspace.controller";
import { getListings, createListing, buyListing } from "../controllers/market.controller";
import { getShop, buyFromShop, getRecipes } from "../controllers/shop.controller";

const router = Router();

// All game routes require authentication
router.use(authMiddleware);

// ─── Player State ────────────────────────────────────
router.get("/inventory", getInventory);
router.post("/eat/:slotId", eatItem);

// ─── Workspace ───────────────────────────────────────
router.get("/workspace", getWorkOrders);
router.post("/workspace/start", startWork);
router.post("/workspace/collect/:orderId", collectWork);

// ─── Market ──────────────────────────────────────────
router.get("/market", getListings);
router.post("/market/sell", createListing);
router.post("/market/buy/:listingId", buyListing);

// ─── Shop & Recipes ──────────────────────────────────
router.get("/shop", getShop);
router.post("/shop/buy", buyFromShop);
router.get("/recipes", getRecipes);

export default router;
