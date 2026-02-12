import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { INVENTORY_SLOTS } from "../config/game.config";
import { syncHunger, applyMealEffect } from "../services/hunger.service";

interface AuthRequest extends Request {
    userId?: number;
}

/**
 * GET /game/inventory — Get player's 8 inventory slots
 */
export const getInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Ensure 8 slots exist
        const existing = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        if (existing.length < INVENTORY_SLOTS) {
            const existingSlots = new Set(existing.map((s) => s.slot));
            const creates = [];
            for (let i = 0; i < INVENTORY_SLOTS; i++) {
                if (!existingSlots.has(i)) {
                    creates.push({ user_id: req.userId!, slot: i });
                }
            }
            if (creates.length > 0) {
                await prisma.inventorySlot.createMany({ data: creates });
            }
            const slots = await prisma.inventorySlot.findMany({
                where: { user_id: req.userId! },
                include: { item: true },
                orderBy: { slot: "asc" },
            });
            res.json({ slots });
            return;
        }

        res.json({ slots: existing });
    } catch (error) {
        console.error("getInventory error:", error);
        res.status(500).json({ error: "Failed to fetch inventory" });
    }
};

/**
 * POST /game/eat/:slotId — Eat a food item from inventory
 */
export const eatItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (typeof req.params.slotId !== 'string') {
            res.status(400).json({ error: "Invalid slot ID" });
            return;
        }
        const slotId = parseInt(req.params.slotId);
        const slot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!slot || !slot.item) {
            res.status(400).json({ error: "No item in this slot" });
            return;
        }

        if (!slot.item.kcal || slot.item.kcal <= 0) {
            res.status(400).json({ error: "This item cannot be eaten" });
            return;
        }

        // Apply meal effect
        const user = await applyMealEffect(
            req.userId!,
            slot.item.kcal,
            slot.item.buff_pct,
            slot.item.buff_mins
        );

        // Reduce quantity or clear slot
        if (slot.quantity > 1) {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { quantity: slot.quantity - 1 },
            });
        } else {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { item_id: null, quantity: 0 },
            });
        }

        // Fetch updated slots
        const slots = await prisma.inventorySlot.findMany({
            where: { user_id: req.userId! },
            include: { item: true },
            orderBy: { slot: "asc" },
        });

        res.json({
            message: `Ate ${slot.item.name}. +${slot.item.kcal} Kcal`,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                money: user.money,
                hunger: user.hunger,
                satiety_buff: user.satiety_buff,
                buff_expires_at: user.buff_expires_at,
            },
            slots,
        });
    } catch (error) {
        console.error("eatItem error:", error);
        res.status(500).json({ error: "Failed to eat item" });
    }
};
