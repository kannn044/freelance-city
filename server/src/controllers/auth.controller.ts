import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { INVENTORY_SLOTS } from "../config/game.config";
import { syncHunger } from "../services/hunger.service";
import {
    ensureCitySchema,
    ensureLegacyCityAssignment,
    getAvailableCities,
    getUserCityContext,
    selectUserCity,
} from "../services/city.service";
import { toJobPayload } from "../lib/userPayload";

const generateToken = (userId: number): string => {
    return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
};

async function findLoginUserByEmail(email: string) {
    await prisma.$executeRaw`
        UPDATE users
        SET role = 'CITIZEN'
        WHERE email = ${email}
          AND (
              role IS NULL
              OR TRIM(CAST(role AS CHAR)) = ''
              OR role NOT IN ('CITIZEN', 'MAYOR')
          )
    `;

    const rows = await prisma.$queryRaw<
        Array<{ id: number; email: string; password_hash: string }>
    >`
        SELECT id, email, password_hash
        FROM users
        WHERE email = ${email}
        LIMIT 1
    `;

    return rows[0] ?? null;
}

/** Standard user response shape (includes occupation levels) */
function userResponse(user: any) {
    return toJobPayload({
        id: user.id,
        email: user.email,
        role: user.role,
        money: user.money,
        hunger: user.hunger,
        hunger_updated_at: user.hunger_updated_at,
        satiety_buff: user.satiety_buff,
        buff_expires_at: user.buff_expires_at,
        first_job_level: user.first_job_level,
        first_job_exp: user.first_job_exp,
        secondary_job_level: user.secondary_job_level,
        secondary_job_exp: user.secondary_job_exp,
    });
}

async function buildUserResponse(user: any) {
    const cityContext = await getUserCityContext(user.id);
    return {
        ...userResponse(user),
        city_key: cityContext.city_key,
        city_selected_at: cityContext.city_selected_at,
        city: cityContext.city,
    };
}

// POST /auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCitySchema(prisma);

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
            data: { email, password_hash, role: "CITIZEN" as any },
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
            user: await buildUserResponse(user),
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// POST /auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        await ensureCitySchema(prisma);

        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required" });
            return;
        }

        const user = await findLoginUserByEmail(email);
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
        const syncedUser = await syncHunger(user.id);

        await ensureLegacyCityAssignment({
            id: syncedUser.id,
            first_job_level: syncedUser.first_job_level,
            secondary_job_level: syncedUser.secondary_job_level,
        });

        res.json({
            token,
            user: await buildUserResponse(syncedUser),
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
        await ensureCitySchema(prisma);

        console.log("=== SELECT CLASS START ===");
        console.log("req.userId:", req.userId);
        console.log("req.body:", JSON.stringify(req.body));

        const requestedJobSlot = String(req.body?.job_slot ?? req.body?.role ?? "").trim().toLowerCase();
        const canonicalJobSlot = requestedJobSlot === "secondary_job" || requestedJobSlot === "chef"
            ? "secondary_job"
            : requestedJobSlot === "first_job" || requestedJobSlot === "provider"
                ? "first_job"
                : null;

        if (!canonicalJobSlot) {
            console.log("Invalid job slot:", req.body?.job_slot ?? req.body?.role);
            res
                .status(400)
                .json({ error: "job_slot must be first_job or secondary_job" });
            return;
        }

        console.log("Finding user with id:", req.userId);
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
        }) as any;
        console.log(
            "Found user:",
            user
                ? `id=${user.id}, first_job_level=${user.first_job_level}, secondary_job_level=${user.secondary_job_level}`
                : "null"
        );

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const cityRows = await prisma.$queryRaw<Array<{ city_key: string | null }>>`
            SELECT city_key
            FROM users
            WHERE id = ${req.userId}
            LIMIT 1
        `;
        if (cityRows[0]?.city_key) {
            res.status(400).json({ error: "Class selection is disabled. Occupation is fixed by selected city." });
            return;
        }

        if ((user.first_job_level ?? 0) >= 1 || (user.secondary_job_level ?? 0) >= 1) {
            console.log("User already has occupation level:", {
                first_job_level: user.first_job_level,
                secondary_job_level: user.secondary_job_level,
            });
            res.status(400).json({ error: "Class has already been selected" });
            return;
        }

        // Initialize selected occupation level to 1
        const updateData: Record<string, any> = {};
        if (canonicalJobSlot === "first_job") {
            updateData.first_job_level = 1;
        } else {
            updateData.secondary_job_level = 1;
        }
        console.log("Updating user with data:", JSON.stringify(updateData));

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: updateData as any,
        }) as any;
        console.log("Updated user successfully:", {
            first_job_level: updatedUser.first_job_level,
            secondary_job_level: updatedUser.secondary_job_level,
        });

        res.json({ user: await buildUserResponse(updatedUser) });
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
        await ensureCitySchema(prisma);

        const user = await syncHunger(req.userId!);

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        await ensureLegacyCityAssignment({
            id: user.id,
            first_job_level: user.first_job_level,
            secondary_job_level: user.secondary_job_level,
        });

        res.json({ user: await buildUserResponse(user) });
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
        await ensureCitySchema(prisma);

        const user = await prisma.user.findUnique({ where: { id: req.userId } }) as any;
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const firstLevel = Number(user.first_job_level ?? 0);
        const secondaryLevel = Number(user.secondary_job_level ?? 0);

        if (firstLevel < 1 && secondaryLevel < 1) {
            res.status(400).json({ error: "You must select a primary class first" });
            return;
        }

        // Unlock whichever occupation is still locked
        const unlockFirstJob = firstLevel < 1;
        const secondaryJobSlot = unlockFirstJob ? "first_job" : "secondary_job";

        // Check secondary not already unlocked
        const targetLevel = unlockFirstJob ? firstLevel : secondaryLevel;
        if (targetLevel >= 1) {
            res.status(400).json({ error: "Second occupation already unlocked" });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: (unlockFirstJob ? { first_job_level: 1 } : { secondary_job_level: 1 }) as any,
        }) as any;

        const cityContext = await getUserCityContext(updatedUser.id);
        const unlockedOccupationLabel = secondaryJobSlot === "first_job"
            ? (cityContext.city?.occupation_labels?.first_job ?? "First Job")
            : (cityContext.city?.occupation_labels?.secondary_job ?? "Secondary Job");

        res.json({
            message: `${unlockedOccupationLabel} occupation unlocked!`,
            user: await buildUserResponse(updatedUser),
        });
    } catch (error) {
        console.error("Unlock occupation error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// GET /auth/cities
export const getCities = async (_req: Request, res: Response): Promise<void> => {
    try {
        const cities = await getAvailableCities();
        res.json({ cities });
    } catch (error) {
        console.error("Get cities error:", error);
        res.status(500).json({ error: "Failed to fetch city list" });
    }
};

// POST /auth/select-city
export const selectCity = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { cityKey } = req.body as { cityKey?: string };
        if (!cityKey) {
            res.status(400).json({ error: "cityKey is required" });
            return;
        }

        const result = await selectUserCity(req.userId!, cityKey);
        const user = await syncHunger(req.userId!);

        const chargeMessage = result.charged > 0
            ? ` (Transfer fee: ${result.charged.toLocaleString()} credits)`
            : "";

        res.json({
            message: `City selected: ${result.cityKey}${chargeMessage}`,
            user: await buildUserResponse(user),
        });
    } catch (error: any) {
        const message = error?.message || "Failed to select city";
        const lower = String(message).toLowerCase();
        const status = lower.includes("not enough") || lower.includes("once per election") || lower.includes("not available") ? 400 : 500;
        res.status(status).json({ error: message });
    }
};
