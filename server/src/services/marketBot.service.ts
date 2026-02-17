import { prisma } from "../lib/prisma";
import { MARKET_BOT_CONFIG } from "../config/game.config";

export interface MarketBotConfig {
    enabled: boolean;
    tickMs: number;
    buyChancePerTick: number; // 0..1
    maxListingsPerTick: number;
    maxQtyPerListing: number;
    maxUnitPriceRatio: number; // max allowed unit price / reference price
    minListingAgeMs: number;
}

const DEFAULT_CONFIG: MarketBotConfig = {
    enabled: MARKET_BOT_CONFIG.enabled,
    tickMs: MARKET_BOT_CONFIG.tickMs,
    buyChancePerTick: MARKET_BOT_CONFIG.buyChancePerTick,
    maxListingsPerTick: MARKET_BOT_CONFIG.maxListingsPerTick,
    maxQtyPerListing: MARKET_BOT_CONFIG.maxQtyPerListing,
    maxUnitPriceRatio: MARKET_BOT_CONFIG.maxUnitPriceRatio,
    minListingAgeMs: MARKET_BOT_CONFIG.minListingAgeMs,
};

class MarketBotService {
    private config: MarketBotConfig = { ...DEFAULT_CONFIG };
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    start() {
        this.restartTimer();
        console.log("🤖 Market bot started", this.config);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getConfig(): MarketBotConfig {
        return { ...this.config };
    }

    updateConfig(next: Partial<MarketBotConfig>): MarketBotConfig {
        this.config = {
            ...this.config,
            ...next,
            tickMs: this.normalizeInt(next.tickMs ?? this.config.tickMs, 1000, 24 * 60 * 60 * 1000),
            buyChancePerTick: this.normalizeFloat(next.buyChancePerTick ?? this.config.buyChancePerTick, 0, 1),
            maxListingsPerTick: this.normalizeInt(next.maxListingsPerTick ?? this.config.maxListingsPerTick, 1, 20),
            maxQtyPerListing: this.normalizeInt(next.maxQtyPerListing ?? this.config.maxQtyPerListing, 1, 9999),
            maxUnitPriceRatio: this.normalizeFloat(next.maxUnitPriceRatio ?? this.config.maxUnitPriceRatio, 0.1, 10),
            minListingAgeMs: this.normalizeInt(next.minListingAgeMs ?? this.config.minListingAgeMs, 0, 24 * 60 * 60 * 1000),
            enabled: typeof next.enabled === "boolean" ? next.enabled : this.config.enabled,
        };

        this.restartTimer();
        return this.getConfig();
    }

    async runTickManually() {
        await this.tick();
    }

    private restartTimer() {
        this.stop();
        this.timer = setInterval(() => {
            void this.tick();
        }, this.config.tickMs);
    }

    private async tick() {
        if (!this.config.enabled || this.running) return;
        this.running = true;

        try {
            const roll = Math.random();
            if (roll > this.config.buyChancePerTick) return;

            const listings = await prisma.marketListing.findMany({
                where: { status: "ACTIVE" },
                include: { item: true },
                orderBy: { created_at: "asc" },
                take: 100,
            });

            if (listings.length === 0) return;

            const shuffled = [...listings].sort(() => Math.random() - 0.5);
            const targetCount = Math.min(this.config.maxListingsPerTick, shuffled.length);

            for (let i = 0; i < targetCount; i++) {
                const listing = shuffled[i];
                const listingAgeMs = Date.now() - new Date(listing.created_at).getTime();
                if (listingAgeMs < this.config.minListingAgeMs) {
                    continue;
                }

                // Anti-overprice: bot only buys listings within configured ratio
                const referenceUnitPrice = this.getReferenceUnitPrice(listing.item);
                if (referenceUnitPrice === null) {
                    continue;
                }

                const unitPrice = listing.price;
                const maxAllowedUnitPrice = referenceUnitPrice * this.config.maxUnitPriceRatio;
                if (unitPrice > maxAllowedUnitPrice) {
                    continue;
                }

                const buyQty = Math.min(
                    listing.quantity,
                    this.config.maxQtyPerListing,
                    this.randomInt(1, Math.max(1, listing.quantity))
                );

                await prisma.$transaction(async (tx) => {
                    const fresh = await tx.marketListing.findFirst({
                        where: { id: listing.id, status: "ACTIVE" },
                        include: { item: true },
                    });

                    if (!fresh) return;

                    const freshRefUnitPrice = this.getReferenceUnitPrice(fresh.item);
                    if (freshRefUnitPrice === null) return;

                    const freshAgeMs = Date.now() - new Date(fresh.created_at).getTime();
                    if (freshAgeMs < this.config.minListingAgeMs) return;

                    const freshMaxAllowed = freshRefUnitPrice * this.config.maxUnitPriceRatio;
                    if (fresh.price > freshMaxAllowed) return;

                    const finalBuyQty = Math.min(
                        buyQty,
                        fresh.quantity,
                        this.config.maxQtyPerListing
                    );
                    const totalCost = finalBuyQty * fresh.price;

                    await tx.user.update({
                        where: { id: fresh.seller_id },
                        data: { money: { increment: totalCost } },
                    });

                    if (finalBuyQty >= fresh.quantity) {
                        await tx.marketListing.update({
                            where: { id: fresh.id },
                            data: {
                                status: "SOLD",
                                sold_at: new Date(),
                            },
                        });
                    } else {
                        await tx.marketListing.update({
                            where: { id: fresh.id },
                            data: { quantity: { decrement: finalBuyQty } },
                        });

                        // Keep sale history accurate for bot partial fills
                        await tx.marketListing.create({
                            data: {
                                seller_id: fresh.seller_id,
                                buyer_id: null, // Market Bot
                                item_id: fresh.item_id,
                                quantity: finalBuyQty,
                                price: fresh.price,
                                status: "SOLD",
                                sold_at: new Date(),
                            },
                        });
                    }
                });
            }
        } catch (error) {
            console.error("market bot tick error:", error);
        } finally {
            this.running = false;
        }
    }

    private normalizeInt(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        const floored = Math.floor(value);
        if (floored < min) return min;
        if (floored > max) return max;
        return floored;
    }

    private normalizeFloat(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private getReferenceUnitPrice(item: { buy_price: number | null; sell_price: number | null }): number | null {
        // Prefer NPC buy price as strongest anti-cheat anchor.
        // Fallback to 2x NPC sell price when buy price is unavailable.
        if (typeof item.buy_price === "number" && item.buy_price > 0) {
            return item.buy_price;
        }
        if (typeof item.sell_price === "number" && item.sell_price > 0) {
            return item.sell_price * 2;
        }
        return null;
    }
}

export const marketBotService = new MarketBotService();
