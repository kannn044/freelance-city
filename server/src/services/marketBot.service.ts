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

    // ─── Bot Cargo Listings (cross-city) ───────────────────
    botCargoEnabled: boolean;
    botCargoTickChance: number;
    maxBotCargoListingsTotal: number;
    botCargoBoxSize: "S" | "M" | "L" | "AUTO";
    botCargoItemsPerBoxMin: number;
    botCargoItemsPerBoxMax: number;
    botCargoQtyPerItemMin: number;
    botCargoQtyPerItemMax: number;
    botCargoPriceRatioMin: number;
    botCargoPriceRatioMax: number;
    botCargoCooldownMs: number;
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

    // Bot cargo defaults (picked from MARKET_BOT_CONFIG)
    botCargoEnabled: MARKET_BOT_CONFIG.botCargoEnabled,
    botCargoTickChance: MARKET_BOT_CONFIG.botCargoTickChance,
    maxBotCargoListingsTotal: MARKET_BOT_CONFIG.maxBotCargoListingsTotal,
    botCargoBoxSize: MARKET_BOT_CONFIG.botCargoBoxSize,
    botCargoItemsPerBoxMin: MARKET_BOT_CONFIG.botCargoItemsPerBoxMin,
    botCargoItemsPerBoxMax: MARKET_BOT_CONFIG.botCargoItemsPerBoxMax,
    botCargoQtyPerItemMin: MARKET_BOT_CONFIG.botCargoQtyPerItemMin,
    botCargoQtyPerItemMax: MARKET_BOT_CONFIG.botCargoQtyPerItemMax,
    botCargoPriceRatioMin: MARKET_BOT_CONFIG.botCargoPriceRatioMin,
    botCargoPriceRatioMax: MARKET_BOT_CONFIG.botCargoPriceRatioMax,
    botCargoCooldownMs: MARKET_BOT_CONFIG.botCargoCooldownMs,
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

/**
 * Maps each city to the item names that are produced/available locally.
 * Bots in a city will only sell items from this list in the city market,
 * so players must use the world market to buy cross-city items.
 */
const CITY_LOCAL_ITEMS: Record<string, string[]> = {
    AGRARIA: [
        "Chicken Meat", "Beef Meat", "Vegetable", "Salt",
        "Chicken Salad", "Beef Steak", "Beef Stew", "Chicken Stew",
    ],
    FERRUM: [
        "Iron Ore", "Copper Ore", "Steel Ore", "Gem", "Coal",
        "Iron Ingot", "Copper Ingot", "Steel Ingot",
    ],
    VOLTARA: [
        "Gas", "Oil",
    ],
    MEDICO: [
        "Flux",
    ],
    TEXTILIS: [
        "Raw Cotton", "Sheep Wool", "Cotton Thread", "Wool Thread",
    ],
};

class MarketBotService {
    private config: MarketBotConfig = { ...DEFAULT_CONFIG };
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private lastSellFeedAt = 0;
    private lastBotCargoFeedAt = 0;

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

            // Bot cargo normalizations
            botCargoEnabled: typeof next.botCargoEnabled === "boolean" ? next.botCargoEnabled : this.config.botCargoEnabled,
            botCargoTickChance: this.normalizeFloat(next.botCargoTickChance ?? this.config.botCargoTickChance, 0, 1),
            maxBotCargoListingsTotal: this.normalizeInt(next.maxBotCargoListingsTotal ?? this.config.maxBotCargoListingsTotal, 0, 500),
            botCargoBoxSize: (["S", "M", "L", "AUTO"] as const).includes(next.botCargoBoxSize as any)
                ? next.botCargoBoxSize as "S" | "M" | "L" | "AUTO"
                : this.config.botCargoBoxSize,
            botCargoItemsPerBoxMin: this.normalizeInt(next.botCargoItemsPerBoxMin ?? this.config.botCargoItemsPerBoxMin, 1, 15),
            botCargoItemsPerBoxMax: this.normalizeInt(next.botCargoItemsPerBoxMax ?? this.config.botCargoItemsPerBoxMax, 1, 15),
            botCargoQtyPerItemMin: this.normalizeInt(next.botCargoQtyPerItemMin ?? this.config.botCargoQtyPerItemMin, 1, 99),
            botCargoQtyPerItemMax: this.normalizeInt(next.botCargoQtyPerItemMax ?? this.config.botCargoQtyPerItemMax, 1, 99),
            botCargoPriceRatioMin: this.normalizeFloat(next.botCargoPriceRatioMin ?? this.config.botCargoPriceRatioMin, 0.1, 10),
            botCargoPriceRatioMax: this.normalizeFloat(next.botCargoPriceRatioMax ?? this.config.botCargoPriceRatioMax, 0.1, 10),
            botCargoCooldownMs: this.normalizeInt(next.botCargoCooldownMs ?? this.config.botCargoCooldownMs, 1_000, 24 * 60 * 60 * 1000),
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
            const shouldCargo = this.config.botCargoEnabled && Math.random() <= this.config.botCargoTickChance;

            if (!shouldSell && !shouldBuy && !shouldCargo) return;

            if (shouldSell) {
                await this.generateBotListings();
            }

            if (shouldCargo) {
                await this.generateBotCargoListings();
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

        // Purge all active bot listings (non-cross-city only) before creating fresh batch.
        await prisma.marketListing.deleteMany({
            where: {
                status: "ACTIVE",
                is_cross_city: false,
                seller_id: { in: botUsers.map((u) => u.id) },
            },
        });

        // Fetch city_key for each bot so we can filter items by city
        const botUsersWithCity = await prisma.user.findMany({
            where: { id: { in: botUsers.map((u) => u.id) } },
            select: { id: true, email: true, city_key: true },
        });

        // Group bots by city
        const botsByCity = new Map<string, typeof botUsersWithCity>();
        for (const bot of botUsersWithCity) {
            const city = bot.city_key ?? "";
            if (!city) continue;
            const arr = botsByCity.get(city) ?? [];
            arr.push(bot);
            botsByCity.set(city, arr);
        }

        let created = 0;

        // For each city, only sell items local to that city
        for (const [cityKey, cityBots] of botsByCity) {
            if (created >= this.config.maxSellListingsPerTick) break;

            const localItemNames = CITY_LOCAL_ITEMS[cityKey];
            if (!localItemNames || localItemNames.length === 0) continue;

            const localItems = targetItems.filter((item) => localItemNames.includes(item.name));
            if (localItems.length === 0) continue;

            const shuffledItems = [...localItems].sort(() => Math.random() - 0.5);

            for (const item of shuffledItems) {
                if (created >= this.config.maxSellListingsPerTick) break;

                const candidates = [...cityBots].sort(() => Math.random() - 0.5);
                const listCount = Math.min(
                    this.config.maxSellersPerItem,
                    candidates.length,
                    this.config.maxSellListingsPerTick - created,
                );

                const chosenSellers = candidates.slice(0, listCount);
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

                    created += 1;
                    if (created >= this.config.maxSellListingsPerTick) break;
                }
            }
        }
    }

    /**
     * Generates bot cargo box listings for the cross-city marketplace.
     *
     * For each eligible bot user (no current LISTED cargo box), the bot:
     *   1. Picks 1-N random item types from `sellItemNames`
     *   2. Chooses an appropriate box size based on total quantity
     *   3. Creates a CargoBox (PACKED) + CargoBoxItems directly (no inventory deducted)
     *   4. Lists it on the marketplace as a cross-city listing
     */
    private async generateBotCargoListings() {
        if (!this.config.botCargoEnabled) return;
        if (this.config.sellItemNames.length === 0) return;

        const now = Date.now();
        if (now - this.lastBotCargoFeedAt < this.config.botCargoCooldownMs) return;

        // Count existing active bot cargo listings
        const botUsers = await this.ensureBotUsers(Math.min(this.config.maxBotUsers, this.config.maxBotCargoListingsTotal));
        if (botUsers.length === 0) return;

        const botUserIds = botUsers.map((u) => u.id);

        const existingCargoCount = await prisma.marketListing.count({
            where: {
                status: "ACTIVE",
                is_cross_city: true,
                seller_id: { in: botUserIds },
            },
        });

        if (existingCargoCount >= this.config.maxBotCargoListingsTotal) return;

        // Purge stale LISTED bot cargo boxes that have no active order
        // (re-listed or leftover from previous batch with no buyers)
        const staleListings = await prisma.marketListing.findMany({
            where: {
                status: "ACTIVE",
                is_cross_city: true,
                seller_id: { in: botUserIds },
                cargo_box_id: { not: null },
            },
            select: { id: true, cargo_box_id: true },
        });

        if (staleListings.length > 0) {
            const staleListingIds = staleListings.map((l) => l.id);
            const staleBoxIds = staleListings.map((l) => l.cargo_box_id!);

            await prisma.marketListing.updateMany({
                where: { id: { in: staleListingIds } },
                data: { status: "CANCELLED" },
            });

            await prisma.cargoBoxItem.deleteMany({
                where: { cargo_box_id: { in: staleBoxIds } },
            });

            await prisma.cargoBox.deleteMany({
                where: {
                    id: { in: staleBoxIds },
                    status: { in: ["LISTED", "PACKED"] },
                    order: null,
                },
            });
        }

        this.lastBotCargoFeedAt = now;

        // Fetch target items
        const targetItems = await prisma.item.findMany({
            where: { name: { in: this.config.sellItemNames } },
            select: { id: true, name: true, buy_price: true, sell_price: true, max_stack: true },
        });
        if (targetItems.length === 0) return;

        // Build listings — one box per eligible bot
        const toCreate = this.config.maxBotCargoListingsTotal - existingCargoCount;
        let created = 0;

        const shuffledBots = [...botUsers].sort(() => Math.random() - 0.5);

        for (const bot of shuffledBots) {
            if (created >= toCreate) break;
            if (!bot) continue;

            // Fetch bot's city (need fresh read since ensureBotUsers may not return city_key)
            const botUser = await prisma.user.findUnique({
                where: { id: bot.id },
                select: { city_key: true },
            });
            if (!botUser?.city_key) continue;

            // Pick a random subset of item types for this box
            const itemTypeCount = this.randomInt(
                this.config.botCargoItemsPerBoxMin,
                Math.min(this.config.botCargoItemsPerBoxMax, targetItems.length),
            );
            const chosenItems = [...targetItems]
                .sort(() => Math.random() - 0.5)
                .slice(0, itemTypeCount);

            type BoxLine = { item_id: number; quantity: number; name: string; buy_price: number | null; sell_price: number | null };
            const boxLines: BoxLine[] = chosenItems.map((item) => ({
                item_id: item.id,
                name: item.name,
                quantity: this.randomInt(
                    this.config.botCargoQtyPerItemMin,
                    Math.min(this.config.botCargoQtyPerItemMax, item.max_stack),
                ),
                buy_price: item.buy_price,
                sell_price: item.sell_price,
            }));

            const totalQty = boxLines.reduce((s, l) => s + l.quantity, 0);

            // Choose box size
            let sizeKey: "S" | "M" | "L";
            if (this.config.botCargoBoxSize !== "AUTO") {
                sizeKey = this.config.botCargoBoxSize;
            } else {
                sizeKey = totalQty <= 5 ? "S" : totalQty <= 10 ? "M" : "L";
            }

            // Clamp quantities to fit box capacity
            const capacity = sizeKey === "S" ? 5 : sizeKey === "M" ? 10 : 15;
            let remaining = capacity;
            const clampedLines: BoxLine[] = [];
            for (const line of boxLines) {
                if (remaining <= 0) break;
                const qty = Math.min(line.quantity, remaining);
                clampedLines.push({ ...line, quantity: qty });
                remaining -= qty;
            }
            if (clampedLines.length === 0) continue;

            // Compute listing price
            let referenceTotal = 0;
            for (const line of clampedLines) {
                const refUnit = this.getSellReferenceUnitPrice(line);
                referenceTotal += refUnit * line.quantity;
            }
            const priceRatio = this.randomFloat(
                this.config.botCargoPriceRatioMin,
                this.config.botCargoPriceRatioMax,
            );
            const listingPrice = Math.max(1, Math.round(referenceTotal * priceRatio));

            try {
                await prisma.$transaction(async (tx) => {
                    // Create the cargo box
                    const box = await tx.cargoBox.create({
                        data: {
                            owner_id: bot.id,
                            size: sizeKey,
                            status: "PACKED",
                        },
                    });

                    // Create cargo box items
                    for (const line of clampedLines) {
                        await tx.cargoBoxItem.create({
                            data: {
                                cargo_box_id: box.id,
                                item_id: line.item_id,
                                quantity: line.quantity,
                            },
                        });
                    }

                    // Create marketplace listing
                    await tx.marketListing.create({
                        data: {
                            seller_id: bot.id,
                            item_id: clampedLines[0].item_id,
                            quantity: clampedLines.reduce((s, l) => s + l.quantity, 0),
                            price: listingPrice,
                            status: "ACTIVE",
                            is_cross_city: true,
                            cargo_box_id: box.id,
                            origin_city: botUser.city_key!,
                        },
                    });

                    // Mark box as LISTED
                    await tx.cargoBox.update({
                        where: { id: box.id },
                        data: { status: "LISTED" },
                    });
                });

                created += 1;
            } catch (err) {
                console.error("generateBotCargoListings: failed to create cargo listing for bot", bot.id, err);
            }
        }
    }

    private async ensureBotUsers(minCount: number): Promise<Array<{ id: number; email: string }>> {
        const desired = this.normalizeInt(minCount, 1, 500);
        const existing = await prisma.user.findMany({
            where: { email: { endsWith: `@${BOT_EMAIL_DOMAIN}` } },
            select: { id: true, email: true, city_key: true },
            take: desired,
            orderBy: { id: "asc" },
        });

        // Ensure we have some city keys available to assign to bots
        let availableCities = ["AGRARIA", "FERRUM"];
        try {
            const citiesDB = await prisma.cityState.findMany({ select: { city_key: true } });
            if (citiesDB.length > 0) {
                availableCities = citiesDB.map(c => c.city_key);
            }
        } catch (error) {
            console.error("Failed to fetch cities for bots, fallback to defaults", error);
        }

        // Fix existing bots that lack a city_key (from previous versions if any)
        const botsMissingCity = existing.filter(u => !u.city_key);
        if (botsMissingCity.length > 0) {
            for (const bot of botsMissingCity) {
                const randomCity = availableCities[this.randomInt(0, availableCities.length - 1)];
                try {
                    await prisma.user.update({
                        where: { id: bot.id },
                        data: { city_key: randomCity }
                    });
                } catch (e) {
                    console.error("Failed assigning city to existing bot:", e);
                }
            }
        }

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

            const randomCity = availableCities[this.randomInt(0, availableCities.length - 1)];

            try {
                await prisma.user.create({
                    data: {
                        email: profile.email,
                        password_hash: BOT_PASSWORD_HASH,
                        city_key: randomCity,
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

    private randomFloat(min: number, max: number): number {
        return min + Math.random() * (max - min);
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
