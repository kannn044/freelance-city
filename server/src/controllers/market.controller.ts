import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { awardSaleExp } from "../services/level.service";

interface AuthRequest extends Request {
    userId?: number;
}

/**
 * GET /game/market — List all active market listings
 */
export const getListings = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const listings = await prisma.marketListing.findMany({
            where: { status: "ACTIVE" },
            include: {
                item: true,
                seller: { select: { id: true, email: true, role: true } },
            },
            orderBy: { created_at: "desc" },
        });

        res.json({ listings });
    } catch (error) {
        console.error("getListings error:", error);
        res.status(500).json({ error: "Failed to fetch listings" });
    }
};

/**
 * POST /game/market/sell — Create a sell listing from inventory
 * Body: { slotId: number, quantity: number, price: number }
 * Awards EXP to the seller based on: (hunger/maxHunger) × item.exp_value × price
 */
export const createListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { slotId, quantity, price } = req.body;

        if (!slotId || !quantity || !price || quantity <= 0 || price <= 0) {
            res.status(400).json({ error: "Invalid listing parameters" });
            return;
        }

        const slot = await prisma.inventorySlot.findFirst({
            where: { id: slotId, user_id: req.userId! },
            include: { item: true },
        });

        if (!slot || !slot.item || slot.quantity < quantity) {
            res.status(400).json({ error: "Not enough items in this slot" });
            return;
        }

        // Deduct from inventory
        if (slot.quantity > quantity) {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { quantity: slot.quantity - quantity },
            });
        } else {
            await prisma.inventorySlot.update({
                where: { id: slotId },
                data: { item_id: null, quantity: 0 },
            });
        }

        // Create listing
        const listing = await prisma.marketListing.create({
            data: {
                seller_id: req.userId!,
                item_id: slot.item.id,
                quantity,
                price,
            },
            include: { item: true },
        });

        // Award EXP to seller
        const expResult = await awardSaleExp(req.userId!, slot.item.id, price);

        // Get updated user for response
        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        let message = `Listed ${quantity}x ${slot.item.name} for ${price} credits`;
        if (expResult.expGained > 0) {
            message += ` (+${expResult.expGained} EXP)`;
        }
        if (expResult.levelUp) {
            message += ` 🎉 Level up!`;
        }

        res.json({
            message,
            listing,
            expGained: expResult.expGained,
            levelUp: expResult.levelUp,
            user: {
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                provider_level: updatedUser!.provider_level,
                provider_exp: updatedUser!.provider_exp,
                chef_level: updatedUser!.chef_level,
                chef_exp: updatedUser!.chef_exp,
            },
        });
    } catch (error) {
        console.error("createListing error:", error);
        res.status(500).json({ error: "Failed to create listing" });
    }
};

/**
 * POST /game/market/buy/:listingId — Buy from a market listing
 */
export const buyListing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (typeof req.params.listingId !== 'string') {
            res.status(400).json({ error: "Invalid listing ID" });
            return;
        }
        const listingId = parseInt(req.params.listingId);

        const listing = await prisma.marketListing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            include: { item: true },
        });

        if (!listing) {
            res.status(404).json({ error: "Listing not found or already sold" });
            return;
        }

        if (listing.seller_id === req.userId!) {
            res.status(400).json({ error: "You cannot buy your own listing" });
            return;
        }

        // Check buyer has enough money
        const buyer = await prisma.user.findUnique({ where: { id: req.userId! } });
        if (!buyer || buyer.money < listing.price) {
            res.status(400).json({ error: "Not enough credits" });
            return;
        }

        // Find slot for buyer's inventory
        const existingSlot = await prisma.inventorySlot.findFirst({
            where: {
                user_id: req.userId!,
                item_id: listing.item_id,
                quantity: { lt: listing.item.max_stack },
            },
        });

        let targetSlot = existingSlot;
        if (!targetSlot) {
            targetSlot = await prisma.inventorySlot.findFirst({
                where: { user_id: req.userId!, item_id: null },
            });
        }

        if (!targetSlot) {
            res.status(400).json({ error: "Inventory full!" });
            return;
        }

        // Execute transaction
        await prisma.$transaction([
            // Transfer money
            prisma.user.update({
                where: { id: req.userId! },
                data: { money: { decrement: listing.price } },
            }),
            prisma.user.update({
                where: { id: listing.seller_id },
                data: { money: { increment: listing.price } },
            }),
            // Update listing
            prisma.marketListing.update({
                where: { id: listingId },
                data: {
                    status: "SOLD",
                    buyer_id: req.userId!,
                    sold_at: new Date(),
                },
            }),
            // Add to buyer inventory
            prisma.inventorySlot.update({
                where: { id: targetSlot!.id },
                data: {
                    item_id: listing.item_id,
                    quantity: existingSlot
                        ? Math.min(existingSlot.quantity + listing.quantity, listing.item.max_stack)
                        : listing.quantity,
                },
            }),
        ]);

        const updatedUser = await prisma.user.findUnique({ where: { id: req.userId! } });

        res.json({
            message: `Bought ${listing.quantity}x ${listing.item.name} for ${listing.price} credits`,
            user: {
                id: updatedUser!.id,
                email: updatedUser!.email,
                role: updatedUser!.role,
                money: updatedUser!.money,
                hunger: updatedUser!.hunger,
                provider_level: updatedUser!.provider_level,
                provider_exp: updatedUser!.provider_exp,
                chef_level: updatedUser!.chef_level,
                chef_exp: updatedUser!.chef_exp,
            },
        });
    } catch (error) {
        console.error("buyListing error:", error);
        res.status(500).json({ error: "Failed to buy listing" });
    }
};
