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
    sellChancePerTick: number; // 0..1
    maxSellListingsPerTick: number;
    maxSellersPerItem: number;
    sellMinQtyPerListing: number;
    sellMaxQtyPerListing: number;
    sellUnitPriceMinRatio: number;
    sellUnitPriceMaxRatio: number;
    sellItemNames: string[];
    sellFeedCooldownMs: number;
    maxActiveBotListingsTotal: number;
    maxBotUsers: number;
}

const DEFAULT_CONFIG: MarketBotConfig = {
    enabled: MARKET_BOT_CONFIG.enabled,
    tickMs: MARKET_BOT_CONFIG.tickMs,
    buyChancePerTick: MARKET_BOT_CONFIG.buyChancePerTick,
    maxListingsPerTick: MARKET_BOT_CONFIG.maxListingsPerTick,
    maxQtyPerListing: MARKET_BOT_CONFIG.maxQtyPerListing,
    maxUnitPriceRatio: MARKET_BOT_CONFIG.maxUnitPriceRatio,
    minListingAgeMs: MARKET_BOT_CONFIG.minListingAgeMs,
    sellChancePerTick: MARKET_BOT_CONFIG.sellChancePerTick,
    maxSellListingsPerTick: MARKET_BOT_CONFIG.maxSellListingsPerTick,
    maxSellersPerItem: MARKET_BOT_CONFIG.maxSellersPerItem,
    sellMinQtyPerListing: MARKET_BOT_CONFIG.sellMinQtyPerListing,
    sellMaxQtyPerListing: MARKET_BOT_CONFIG.sellMaxQtyPerListing,
    sellUnitPriceMinRatio: MARKET_BOT_CONFIG.sellUnitPriceMinRatio,
    sellUnitPriceMaxRatio: MARKET_BOT_CONFIG.sellUnitPriceMaxRatio,
    sellItemNames: [...MARKET_BOT_CONFIG.sellItemNames],
    sellFeedCooldownMs: MARKET_BOT_CONFIG.sellFeedCooldownMs,
    maxActiveBotListingsTotal: MARKET_BOT_CONFIG.maxActiveBotListingsTotal,
    maxBotUsers: MARKET_BOT_CONFIG.maxBotUsers,
};

const BOT_EMAIL_DOMAIN = "npc.market";
const BOT_PASSWORD_HASH = "BOT_ACCOUNT_NO_LOGIN";
const BOT_FIRST_NAMES = [
    "Somchai", "Narin", "Kritt", "Anan", "Kawin", "Thanakorn", "Preecha", "Saran",
    "Mali", "Nicha", "Pim", "Kanya", "Suda", "Sirin", "Lalin", "Ploy",
];
const BOT_LAST_NAMES = [
    "Sukjai", "Wattana", "Srisuk", "Rattanakorn", "Pongsiri", "Maneechai", "Chaiyakul", "Boonmee",
    "Kittipong", "Saelim", "Jaroen", "Prasert", "Nuanjan", "Thongdee", "Ariyakul", "Sombat",
];

class MarketBotService {
    private config: MarketBotConfig = { ...DEFAULT_CONFIG };
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private lastSellFeedAt = 0;

    start() {
        this.restartTimer();
        console.log("Market bot started", this.config);
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
        const nextMinSellQty = this.normalizeInt(next.sellMinQtyPerListing ?? this.config.sellMinQtyPerListing, 1, 9999);
        const nextMaxSellQty = this.normalizeInt(next.sellMaxQtyPerListing ?? this.config.sellMaxQtyPerListing, 1, 9999);
        const normalizedSellMinQty = Math.min(nextMinSellQty, nextMaxSellQty);
        const normalizedSellMaxQty = Math.max(nextMinSellQty, nextMaxSellQty);

        const nextSellMinRatio = this.normalizeFloat(next.sellUnitPriceMinRatio ?? this.config.sellUnitPriceMinRatio, 0.1, 10);
        const nextSellMaxRatio = this.normalizeFloat(next.sellUnitPriceMaxRatio ?? this.config.sellUnitPriceMaxRatio, 0.1, 10);
        const normalizedSellMinRatio = Math.min(nextSellMinRatio, nextSellMaxRatio);
        const normalizedSellMaxRatio = Math.max(nextSellMinRatio, nextSellMaxRatio);

        const nextSellItemNames = Array.isArray(next.sellItemNames)
            ? next.sellItemNames.map((n) => String(n).trim()).filter(Boolean)
            : this.config.sellItemNames;

        this.config = {
            ...this.config,
            ...next,
            tickMs: this.normalizeInt(next.tickMs ?? this.config.tickMs, 1000, 24 * 60 * 60 * 1000),
            buyChancePerTick: this.normalizeFloat(next.buyChancePerTick ?? this.config.buyChancePerTick, 0, 1),
            maxListingsPerTick: this.normalizeInt(next.maxListingsPerTick ?? this.config.maxListingsPerTick, 1, 20),
            maxQtyPerListing: this.normalizeInt(next.maxQtyPerListing ?? this.config.maxQtyPerListing, 1, 9999),
            maxUnitPriceRatio: this.normalizeFloat(next.maxUnitPriceRatio ?? this.config.maxUnitPriceRatio, 0.1, 10),
            minListingAgeMs: this.normalizeInt(next.minListingAgeMs ?? this.config.minListingAgeMs, 0, 24 * 60 * 60 * 1000),
            sellChancePerTick: this.normalizeFloat(next.sellChancePerTick ?? this.config.sellChancePerTick, 0, 1),
            maxSellListingsPerTick: this.normalizeInt(next.maxSellListingsPerTick ?? this.config.maxSellListingsPerTick, 0, 50),
            maxSellersPerItem: this.normalizeInt(next.maxSellersPerItem ?? this.config.maxSellersPerItem, 1, 10),
            sellMinQtyPerListing: normalizedSellMinQty,
            sellMaxQtyPerListing: normalizedSellMaxQty,
            sellUnitPriceMinRatio: normalizedSellMinRatio,
            sellUnitPriceMaxRatio: normalizedSellMaxRatio,
            sellItemNames: nextSellItemNames.length > 0 ? [...nextSellItemNames] : [...this.config.sellItemNames],
            sellFeedCooldownMs: this.normalizeInt(next.sellFeedCooldownMs ?? this.config.sellFeedCooldownMs, 1_000, 24 * 60 * 60 * 1000),
            maxActiveBotListingsTotal: this.normalizeInt(next.maxActiveBotListingsTotal ?? this.config.maxActiveBotListingsTotal, 1, 1_000),
            maxBotUsers: this.normalizeInt(next.maxBotUsers ?? this.config.maxBotUsers, 1, 1_000),
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
            const shouldSell = Math.random() <= this.config.sellChancePerTick;
            const shouldBuy = Math.random() <= this.config.buyChancePerTick;
            if (!shouldSell && !shouldBuy) return;

            if (shouldSell) {
                await this.generateBotListings();
            }

            if (shouldBuy) {
                await this.buyListings();
            }
        } catch (error) {
            console.error("market bot tick error:", error);
        } finally {
            this.running = false;
        }
    }

    private async buyListings() {
        const listingsRaw = await prisma.marketListing.findMany({
            where: { status: "ACTIVE" },
            include: {
                item: {
                    select: {
                        buy_price: true,
                        sell_price: true,
                    },
                },
                seller: {
                    select: {
                        email: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
            take: 500,
        });

        const listings = listingsRaw.filter((listing) => !this.isBotEmail(listing.seller.email));

        if (listings.length === 0) return;

        // Global fairness: randomize sellers first, then pick listings in round-robin
        // so bot can buy from all players (logged in or not), not just one seller cluster.
        const perSeller = new Map<number, typeof listings>();
        for (const listing of listings) {
            const arr = perSeller.get(listing.seller_id) ?? [];
            arr.push(listing);
            perSeller.set(listing.seller_id, arr);
        }

        const sellerIds = [...perSeller.keys()].sort(() => Math.random() - 0.5);
        for (const sellerId of sellerIds) {
            const arr = perSeller.get(sellerId);
            if (!arr) continue;
            arr.sort(() => Math.random() - 0.5);
        }

        const picked: typeof listings = [];
        let exhausted = false;
        let round = 0;
        while (!exhausted && picked.length < this.config.maxListingsPerTick) {
            exhausted = true;
            for (const sellerId of sellerIds) {
                const arr = perSeller.get(sellerId) ?? [];
                if (round < arr.length) {
                    picked.push(arr[round]);
                    exhausted = false;
                    if (picked.length >= this.config.maxListingsPerTick) break;
                }
            }
            round += 1;
        }

        for (const listing of picked) {
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
                    include: {
                        item: {
                            select: {
                                buy_price: true,
                                sell_price: true,
                            },
                        },
                    },
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
    }

    private async generateBotListings() {
        if (this.config.maxSellListingsPerTick <= 0 || this.config.sellItemNames.length === 0) return;

        const now = Date.now();
        if (now - this.lastSellFeedAt < this.config.sellFeedCooldownMs) return;
        this.lastSellFeedAt = now;

        const targetItems = await prisma.item.findMany({
            where: { name: { in: this.config.sellItemNames } },
            select: {
                id: true,
                name: true,
                max_stack: true,
                buy_price: true,
                sell_price: true,
            },
        });

        if (targetItems.length === 0) return;

        const maxBotUsersNeeded = Math.max(
            this.config.maxSellersPerItem,
            this.config.maxSellersPerItem * targetItems.length
        );
        const botUsers = await this.ensureBotUsers(Math.min(this.config.maxBotUsers, maxBotUsersNeeded));
        if (botUsers.length === 0) return;

        const activeBotListingsTotal = await prisma.marketListing.count({
            where: {
                status: "ACTIVE",
                seller_id: { in: botUsers.map((u) => u.id) },
            },
        });

        const remainingGlobalSlots = this.config.maxActiveBotListingsTotal - activeBotListingsTotal;
        if (remainingGlobalSlots <= 0) return;

        const activeBotListingsByTargetItem = await prisma.marketListing.findMany({
            where: {
                status: "ACTIVE",
                item_id: { in: targetItems.map((item) => item.id) },
                seller_id: { in: botUsers.map((u) => u.id) },
            },
            select: {
                item_id: true,
                seller_id: true,
            },
        });

        const botSellerIdsByItem = new Map<number, Set<number>>();
        for (const listing of activeBotListingsByTargetItem) {
            const current = botSellerIdsByItem.get(listing.item_id) ?? new Set<number>();
            current.add(listing.seller_id);
            botSellerIdsByItem.set(listing.item_id, current);
        }

        const shuffledItems = [...targetItems].sort(() => Math.random() - 0.5);
        let created = 0;
        for (const item of shuffledItems) {
            if (created >= this.config.maxSellListingsPerTick || created >= remainingGlobalSlots) break;

            const currentSellers = botSellerIdsByItem.get(item.id) ?? new Set<number>();
            const availableSlots = this.config.maxSellersPerItem - currentSellers.size;
            if (availableSlots <= 0) continue;

            const candidates = botUsers.filter((u) => !currentSellers.has(u.id));
            if (candidates.length === 0) continue;

            const listCount = Math.min(
                availableSlots,
                candidates.length,
                this.config.maxSellListingsPerTick - created,
                remainingGlobalSlots - created,
                this.randomInt(1, Math.max(1, Math.min(availableSlots, 2)))
            );

            const chosenSellers = this.pickRandomDistinct(candidates, listCount);
            for (const seller of chosenSellers) {
                const minQty = Math.max(1, Math.min(this.config.sellMinQtyPerListing, item.max_stack));
                const maxQty = Math.max(minQty, Math.min(this.config.sellMaxQtyPerListing, item.max_stack));
                const qty = this.randomInt(minQty, maxQty);

                const ref = this.getSellReferenceUnitPrice(item);
                const minPrice = Math.max(1, Math.floor(ref * this.config.sellUnitPriceMinRatio));
                const maxPrice = Math.max(minPrice, Math.ceil(ref * this.config.sellUnitPriceMaxRatio));
                const unitPrice = this.randomInt(minPrice, maxPrice);

                await prisma.marketListing.create({
                    data: {
                        seller_id: seller.id,
                        item_id: item.id,
                        quantity: qty,
                        price: unitPrice,
                        status: "ACTIVE",
                    },
                });

                currentSellers.add(seller.id);
                created += 1;
                if (created >= this.config.maxSellListingsPerTick) break;
            }

            botSellerIdsByItem.set(item.id, currentSellers);
        }
    }

    private async ensureBotUsers(minCount: number): Promise<Array<{ id: number; email: string }>> {
        const desired = this.normalizeInt(minCount, 1, 500);
        const existing = await prisma.user.findMany({
            where: { email: { endsWith: `@${BOT_EMAIL_DOMAIN}` } },
            select: { id: true, email: true },
            take: desired,
            orderBy: { id: "asc" },
        });

        if (existing.length >= desired) {
            return existing;
        }

        const existingEmails = new Set(existing.map((u) => u.email.toLowerCase()));
        const targetCreates = desired - existing.length;
        let createdCount = 0;
        let attempts = 0;

        while (createdCount < targetCreates && attempts < targetCreates * 20) {
            attempts += 1;
            const profile = this.generateBotProfile(attempts);
            const emailLower = profile.email.toLowerCase();
            if (existingEmails.has(emailLower)) continue;

            try {
                await prisma.user.create({
                    data: {
                        email: profile.email,
                        password_hash: BOT_PASSWORD_HASH,
                    },
                });
                existingEmails.add(emailLower);
                createdCount += 1;
            } catch {
                // Ignore duplicate race and continue generating.
            }
        }

        return prisma.user.findMany({
            where: { email: { endsWith: `@${BOT_EMAIL_DOMAIN}` } },
            select: { id: true, email: true },
            take: desired,
            orderBy: { id: "asc" },
        });
    }

    private generateBotProfile(seed: number): { email: string } {
        const first = BOT_FIRST_NAMES[this.randomInt(0, BOT_FIRST_NAMES.length - 1)];
        const last = BOT_LAST_NAMES[this.randomInt(0, BOT_LAST_NAMES.length - 1)];
        const suffix = `${Date.now().toString(36)}${seed.toString(36)}${this.randomInt(10, 99)}`;
        const email = `${first.toLowerCase()}.${last.toLowerCase()}.${suffix}@${BOT_EMAIL_DOMAIN}`;
        return { email };
    }

    private pickRandomDistinct<T>(arr: T[], count: number): T[] {
        if (count <= 0 || arr.length === 0) return [];
        const shuffled = [...arr].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    private isBotEmail(email: string): boolean {
        return email.toLowerCase().endsWith(`@${BOT_EMAIL_DOMAIN}`);
    }

    private getSellReferenceUnitPrice(item: { buy_price: number | null; sell_price: number | null }): number {
        if (typeof item.sell_price === "number" && item.sell_price > 0) {
            return item.sell_price;
        }
        if (typeof item.buy_price === "number" && item.buy_price > 0) {
            return item.buy_price;
        }
        return 100;
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
