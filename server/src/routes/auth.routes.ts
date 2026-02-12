import { Router } from "express";
import { register, login, selectClass, me, unlockSecondOccupation } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/select-class", authMiddleware, selectClass);
router.post("/unlock-occupation", authMiddleware, unlockSecondOccupation);
router.get("/me", authMiddleware, me);

export default router;
