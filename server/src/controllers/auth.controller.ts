import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { INVENTORY_SLOTS, UNLOCK_SECOND_OCCUPATION_LEVEL } from "../config/game.config";

const generateToken = (userId: number): string => {
    return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
};

/** Standard user response shape (includes occupation levels) */
function userResponse(user: any) {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        money: user.money,
        hunger: user.hunger,
        hunger_updated_at: user.hunger_updated_at,
        satiety_buff: user.satiety_buff,
        buff_expires_at: user.buff_expires_at,
        provider_level: user.provider_level,
        provider_exp: user.provider_exp,
        chef_level: user.chef_level,
        chef_exp: user.chef_exp,
    };
}

// POST /auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        if (password.length < 6) {
            res
                .status(400)
                .json({ error: "Password must be at least 6 characters" });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(409).json({ error: "Email already registered" });
            return;
        }

        const password_hash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: { email, password_hash },
        });

        // Initialize 8 empty inventory slots
        await prisma.inventorySlot.createMany({
            data: Array.from({ length: INVENTORY_SLOTS }, (_, i) => ({
                user_id: user.id,
                slot: i,
            })),
        });

        const token = generateToken(user.id);

        res.status(201).json({
            token,
            user: userResponse(user),
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// POST /auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const token = generateToken(user.id);

        res.json({
            token,
            user: userResponse(user),
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// POST /auth/select-class
export const selectClass = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        console.log("=== SELECT CLASS START ===");
        console.log("req.userId:", req.userId);
        console.log("req.body:", JSON.stringify(req.body));

        const { role } = req.body;

        if (!role || !["PROVIDER", "CHEF"].includes(role)) {
            console.log("Invalid role:", role);
            res
                .status(400)
                .json({ error: "Role must be either PROVIDER or CHEF" });
            return;
        }

        console.log("Finding user with id:", req.userId);
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
        });
        console.log("Found user:", user ? `id=${user.id}, role=${user.role}` : "null");

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.role !== "NONE") {
            console.log("User already has role:", user.role);
            res.status(400).json({ error: "Class has already been selected" });
            return;
        }

        // Set role AND initialise the occupation level to 1
        const updateData: Record<string, any> = { role };
        if (role === "PROVIDER") {
            updateData.provider_level = 1;
        } else {
            updateData.chef_level = 1;
        }
        console.log("Updating user with data:", JSON.stringify(updateData));

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: updateData,
        });
        console.log("Updated user successfully, new role:", updatedUser.role);

        res.json({ user: userResponse(updatedUser) });
        console.log("=== SELECT CLASS END (success) ===");
    } catch (error: any) {
        console.error("=== SELECT CLASS ERROR ===");
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        res.status(500).json({ error: error });
    }
};

// GET /auth/me
export const me = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json({ user: userResponse(user) });
    } catch (error) {
        console.error("Me error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// POST /auth/unlock-occupation — Manually unlock the second occupation
export const unlockSecondOccupation = async (
    req: AuthRequest,
    res: Response
): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        if (user.role === "NONE") {
            res.status(400).json({ error: "You must select a primary class first" });
            return;
        }

        // Determine which occupation to unlock
        const primaryOccupation = user.role === "PROVIDER" ? "provider" : "chef";
        const secondaryOccupation = primaryOccupation === "provider" ? "chef" : "provider";
        const primaryLevelField = primaryOccupation === "provider" ? "provider_level" : "chef_level";
        const secondaryLevelField = secondaryOccupation === "provider" ? "provider_level" : "chef_level";

        // Check primary is high enough level
        if (user[primaryLevelField] < UNLOCK_SECOND_OCCUPATION_LEVEL) {
            res.status(400).json({
                error: `You need Level ${UNLOCK_SECOND_OCCUPATION_LEVEL} in your primary occupation to unlock the second one. Current: Level ${user[primaryLevelField]}`,
            });
            return;
        }

        // Check secondary not already unlocked
        if (user[secondaryLevelField] >= 1) {
            res.status(400).json({ error: "Second occupation already unlocked" });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: { [secondaryLevelField]: 1 },
        });

        res.json({
            message: `🔓 ${secondaryOccupation === "provider" ? "Provider" : "Chef"} occupation unlocked!`,
            user: userResponse(updatedUser),
        });
    } catch (error) {
        console.error("Unlock occupation error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
