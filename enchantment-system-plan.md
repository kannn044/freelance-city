# Equipment Enchantment System — Implementation Plan

## 1. Overview

The **Enchantment System** allows players to power up their equipment beyond the base rarity cap. Equipment is enchanted at the **Textilis city** workshop using Enchantment Materials crafted by the Tailor/Weaver occupations. Each successful enchantment raises the item's **enchant level** from +0 to a maximum of **+12**, amplifying its base stats and unlocking **Special Stats** at milestone levels (+3, +6, +9, +12).

---

## 2. Core Enchantment Rules

### 2.1 Success Rates

| Enchant Level | Success Rate |
|:---:|:---:|
| +1 | 90% |
| +2 | 80% |
| +3 | 50% ⭐ Milestone |
| +4 | 40% |
| +5 | 30% |
| +6 | 10% ⭐ Milestone |
| +7 | 8% |
| +8 | 4% |
| +9 | 1% ⭐ Milestone |
| +10 | 0.5% |
| +11 | 0.01% |
| +12 | 0.005% ⭐ Milestone |

### 2.2 Failure Behavior

- **+1 to +5 failure**: Enchant level is **unchanged** (safe zone). No penalty.
- **+6 to +9 failure**: Enchant level **drops by 1** (e.g., attempting +7 fails → item reverts to +6).
- **+10 to +12 failure**: Enchant level **drops by 2** (e.g., attempting +11 fails → item reverts to +9). Special stats at lost milestones are **re-rolled** on re-reaching that milestone.

> **Rationale**: Adds meaningful tension at high levels without outright destroying the item. This mirrors the existing durability attrition loop.

### 2.3 Milestone Levels (+3 / +6 / +9 / +12)

When an item **successfully reaches** a milestone level for the first time (or re-reaches it after a failure drop), the system randomly assigns **one new Special Stat** from the available pool (see Section 5). A fully enchanted (+12) item will have **exactly 4 Special Stats**.

---

## 3. Enchantment Materials (Textilis Crafting)

Textilis introduces three tiers of Enchantment Materials, crafted via the **Tailor** (SEW) workspace:

| Material | Craft Time | Ingredients | Used For |
|:---|:---|:---|:---|
| **Enchant Stone** | 5 min | 3× Fiber Thread + 1× Salt | +1 to +6 |
| **Rune Shard** | 15 min | 2× Enchant Stone + 1× Iron Ingot + 1× Flux | +7 to +9 |
| **Arcane Crystal** | 40 min | 2× Rune Shard + 1× Steel Ingot + 1× Oil | +10 to +12 |

> `Fiber Thread` is a RAW material produced by the Weaver (SEW/EXTRACT) workspace in Textilis from `Fiber Seeds`.

### 3.1 Material + Gold Cost per Attempt

| Enchant Attempt | Material Required | Gold Cost |
|:---:|:---|:---:|
| +1 → +2 | 3× Enchant Stone | 500g |
| +2 → +3 | 5× Enchant Stone | 1000g |
| +3 → +4 | 10× Enchant Stone | 2000g |
| +4 → +5 | 15× Enchant Stone | 4000g |
| +5 → +6 | 30× Enchant Stone | 8000g |
| +6 → +7 | 10× Rune Shard | 12,000g |
| +7 → +8 | 20× Rune Shard | 18,000g |
| +8 → +9 | 30× Rune Shard | 24,000g |
| +9 → +10 | 10× Arcane Crystal | 28,000g |
| +10 → +11 | 20× Arcane Crystal | 40,000g |
| +11 → +12 | 30× Arcane Crystal | 90,000g |

Materials are **consumed on attempt** regardless of success or failure.

---

## 4. Base Stat Scaling (Enchant Level Multiplier)

An enchanted item's **base effect** (`effect_value` / `effect_value2`) is multiplied by both the existing **rarity multiplier** and a new **enchant bonus multiplier**:

```
effectiveStat = base_value × rarityMultiplier × (1 + enchantBonus)
```

| Enchant Level | Enchant Bonus |
|:---:|:---:|
| +0 | 0% |
| +1 | 5% |
| +2 | 10% |
| +3 | 18% |
| +4 | 25% |
| +5 | 33% |
| +6 | 44% |
| +7 | 55% |
| +8 | 68% |
| +9 | 83% |
| +10 | 100% |
| +11 | 120% |
| +12 | 150% |

> Example: A **LEGENDARY Fork** (`farm_time_reduction_pct` base 0.40, rarity multiplier 1.0) at **+12** yields: `0.40 × 1.0 × (1 + 1.50)` = **70% farm time reduction** (capped at 80% system max).

---

## 5. Special Stats Design

### 5.1 Special Stat Pool (12 available)

The system maintains a pool of 12 special stats. On each milestone, **one is selected at random** from the stats **not yet assigned** to the item. The value shown is the flat bonus per special-stat occurrence (stacks if the same stat appears on multiple equipped items).

| ID | Effect Key | Description | Value per Stack |
|:---:|:---|:---|:---:|
| SS-01 | `enchant_exp_gain_pct` | Bonus EXP from all work orders | +8% |
| SS-02 | `enchant_durability_protect_pct` | Reduces equipment durability decay rate | −12% |
| SS-03 | `enchant_rare_drop_pct` | Increases chance of Rare/Epic/Legendary harvest | +3% |
| SS-04 | `enchant_harvest_qty_bonus` | Bonus item quantity on "FARM","MINE","EXTRACT","GATHER","FORAGE" collect (flat) | +1 qty |
| SS-05 | `enchant_market_tax_discount_pct` | Reduces all market taxes (import/export/domestic) | −2% |
| SS-06 | `enchant_task_hunger_cost_pct` | Reduces hunger burned per active task | −8% |
| SS-07 | `enchant_max_hunger_flat` | Flat max hunger capacity bonus | +150 Kcal |
| SS-08 | `enchant_cook_double_chance_pct` | Chance to produce double output on COOK/SMELT | +4% |
| SS-09 | `enchant_mine_yield_bonus_pct` | Bonus ore/gem yield from MINE expeditions | +5% |
| SS-10 | `enchant_satiety_buff_duration_pct` | Extends meal satiety buff duration | +15% |
| SS-11 | `enchant_ingredient_save_extra_pct` | Extra chance to save all (primary + secondary) ingredients | +5% |
| SS-12 | `enchant_work_speed_pct` | Universal work speed bonus (all task types) | +4% |

### 5.2 Milestone → Special Stat Assignment

```
+3  reached → Roll 1 stat from pool[0..11]           → special_stat_1
+6  reached → Roll 1 stat from pool minus SS already assigned → special_stat_2
+9  reached → Roll 1 stat from pool minus SS already assigned → special_stat_3
+12 reached → Roll 1 stat from pool minus SS already assigned → special_stat_4
```

If a level drops below a milestone (e.g., fail at +10 → revert to +8), `special_stat_3` and `special_stat_4` are **cleared**. When +9 is re-reached, a fresh random roll occurs for `special_stat_3`.

---

## 6. Database Schema Changes

### 6.1 New Items (seed data in `master-data.json`)

```json
{ "name": "Enchant Stone",   "type": "INGREDIENT", "max_stack": 99, "buy_price": null, "sell_price": 40,  "icon": "enchant_stone" },
{ "name": "Rune Shard",      "type": "INGREDIENT", "max_stack": 99, "buy_price": null, "sell_price": 120, "icon": "rune_shard" },
{ "name": "Fiber Thread",    "type": "RAW",        "max_stack": 99, "buy_price": null, "sell_price": 15,  "icon": "fiber_thread" },
{ "name": "Fiber Seed",      "type": "SEED",       "max_stack": 10, "buy_price": 30,  "sell_price": 10,  "icon": "fiber_seed",
  "yield_item": "Fiber Thread", "yield_qty": 3, "grow_mins": 8 },
{ "name": "Arcane Crystal",  "type": "INGREDIENT", "max_stack": 20, "buy_price": null, "sell_price": 600, "icon": "arcane_crystal" }
```

### 6.2 New Enchantment Recipes (in `recipes` + `recipe_ingredients`)

```
"Craft Enchant Stone":  3× Fiber Thread + 1× Salt  → 1× Enchant Stone  (SEW, 5 min)
"Craft Rune Shard":     2× Enchant Stone + 1× Iron Ingot + 1× Flux → 1× Rune Shard (SEW, 15 min)
"Craft Arcane Crystal": 2× Rune Shard + 1× Steel Ingot + 1× Oil → 1× Arcane Crystal (SEW, 40 min)
```

### 6.3 Schema Migrations

#### `inventory_slots` table — add columns:

```sql
ALTER TABLE inventory_slots
  ADD COLUMN enchant_level       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1      VARCHAR(60) NULL,
  ADD COLUMN special_stat_2      VARCHAR(60) NULL,
  ADD COLUMN special_stat_3      VARCHAR(60) NULL,
  ADD COLUMN special_stat_4      VARCHAR(60) NULL;
```

#### `user_equipments` table — add columns:

```sql
ALTER TABLE user_equipments
  ADD COLUMN enchant_level       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1      VARCHAR(60) NULL,
  ADD COLUMN special_stat_2      VARCHAR(60) NULL,
  ADD COLUMN special_stat_3      VARCHAR(60) NULL,
  ADD COLUMN special_stat_4      VARCHAR(60) NULL;
```

#### `market_listings` table — add columns:

```sql
ALTER TABLE market_listings
  ADD COLUMN enchant_level       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1      VARCHAR(60) NULL,
  ADD COLUMN special_stat_2      VARCHAR(60) NULL,
  ADD COLUMN special_stat_3      VARCHAR(60) NULL,
  ADD COLUMN special_stat_4      VARCHAR(60) NULL;
```

#### `prisma/schema.prisma` — update models:

```prisma
model InventorySlot {
  // ... existing fields ...
  enchant_level        Int     @default(0)
  special_stat_1       String?
  special_stat_2       String?
  special_stat_3       String?
  special_stat_4       String?
}

model UserEquipment {
  // ... existing fields ...
  enchant_level        Int     @default(0)
  special_stat_1       String?
  special_stat_2       String?
  special_stat_3       String?
  special_stat_4       String?
}

model MarketListing {
  // ... existing fields ...
  enchant_level        Int     @default(0)
  special_stat_1       String?
  special_stat_2       String?
  special_stat_3       String?
  special_stat_4       String?
}
```

---

## 7. Backend Implementation

### 7.1 New Constants (`shared/gameConfig.ts`)

```typescript
// ─── Enchantment System ──────────────────────────────────

export const ENCHANT_SUCCESS_RATES: Record<number, number> = {
  1: 0.90, 2: 0.80, 3: 0.50, 4: 0.40, 5: 0.30,
  6: 0.10, 7: 0.08, 8: 0.04, 9: 0.01,
  10: 0.005, 11: 0.0001, 12: 0.00005,
};

export const ENCHANT_BONUS_MULTIPLIER: Record<number, number> = {
  0: 0, 1: 0.05, 2: 0.10, 3: 0.18, 4: 0.25,
  5: 0.33, 6: 0.44, 7: 0.55, 8: 0.68,
  9: 0.83, 10: 1.00, 11: 1.20, 12: 1.50,
};

export const ENCHANT_MILESTONES = [3, 6, 9, 12] as const;

export const ENCHANT_FAILURE_DROP: Record<number, number> = {
  // 1–5: no drop (0)
  1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  // 6–9: drop 1
  6: 1, 7: 1, 8: 1, 9: 1,
  // 10–12: drop 2
  10: 2, 11: 2, 12: 2,
};

export const ENCHANT_MATERIAL_COST: Record<number, { itemName: string; qty: number; gold: number }> = {
  1: { itemName: "Enchant Stone", qty: 1, gold: 50 },
  2: { itemName: "Enchant Stone", qty: 2, gold: 100 },
  3: { itemName: "Enchant Stone", qty: 3, gold: 150 },
  4: { itemName: "Enchant Stone", qty: 4, gold: 200 },
  5: { itemName: "Enchant Stone", qty: 5, gold: 300 },
  6: { itemName: "Rune Shard",    qty: 1, gold: 500 },
  7: { itemName: "Rune Shard",    qty: 2, gold: 750 },
  8: { itemName: "Rune Shard",    qty: 3, gold: 1000 },
  9: { itemName: "Arcane Crystal",qty: 1, gold: 2000 },
  10: { itemName: "Arcane Crystal", qty: 2, gold: 3500 },
  11: { itemName: "Arcane Crystal", qty: 3, gold: 5000 },
};

export const SPECIAL_STAT_POOL = [
  "enchant_exp_gain_pct",
  "enchant_durability_protect_pct",
  "enchant_rare_drop_pct",
  "enchant_harvest_qty_bonus",
  "enchant_market_tax_discount_pct",
  "enchant_task_hunger_cost_pct",
  "enchant_max_hunger_flat",
  "enchant_cook_double_chance_pct",
  "enchant_mine_yield_bonus_pct",
  "enchant_satiety_buff_duration_pct",
  "enchant_ingredient_save_extra_pct",
  "enchant_work_speed_pct",
] as const;

export type SpecialStatKey = typeof SPECIAL_STAT_POOL[number];

export const SPECIAL_STAT_VALUES: Record<SpecialStatKey, number> = {
  enchant_exp_gain_pct:               0.08,
  enchant_durability_protect_pct:     0.12,
  enchant_rare_drop_pct:              0.03,
  enchant_harvest_qty_bonus:          1,
  enchant_market_tax_discount_pct:    0.02,
  enchant_task_hunger_cost_pct:       0.08,
  enchant_max_hunger_flat:            150,
  enchant_cook_double_chance_pct:     0.04,
  enchant_mine_yield_bonus_pct:       0.05,
  enchant_satiety_buff_duration_pct:  0.15,
  enchant_ingredient_save_extra_pct:  0.05,
  enchant_work_speed_pct:             0.04,
};
```

### 7.2 New Service: `server/src/services/enchantment.service.ts`

**Responsibilities:**
- `rollEnchantResult(currentLevel)` — Rolls against success rate, returns `{ success, newLevel, droppedMilestones }`.
- `assignSpecialStat(existingStats, newMilestone)` — Randomly picks a stat from the pool excluding already assigned.
- `getEnchantedEffects(userId, db)` — Aggregates all special stats from `user_equipments` that are active (durability > 0 and enchant_level > 0).
- `applyEnchantToInventorySlot(userId, slotId, db)` — Core transaction: deduct materials + gold, roll, update `enchant_level` and `special_stat_*`, return result.
- `getEnchantCostPreview(currentLevel)` — Returns required material name, qty, and gold cost without mutating state.

```typescript
// Pseudocode outline
export async function attemptEnchant(
  userId: number,
  inventorySlotId: number,
  db = prisma
): Promise<EnchantAttemptResult> {
  return db.$transaction(async (tx) => {
    // 1. Load the inventory slot (must be EQUIPMENT type, must be in player's inventory)
    // 2. Validate current city = Textilis (or allow globally if design allows)
    // 3. Load ENCHANT_MATERIAL_COST for targetLevel = currentLevel + 1
    // 4. Deduct required material qty from inventory
    // 5. Deduct gold from user.money
    // 6. Roll success: Math.random() < ENCHANT_SUCCESS_RATES[targetLevel]
    // 7a. Success:
    //     - Increment enchant_level
    //     - If new level is a MILESTONE: assign new special stat
    // 7b. Failure:
    //     - drop = ENCHANT_FAILURE_DROP[targetLevel]
    //     - Decrement enchant_level by drop
    //     - Clear special_stat fields for milestones now below current level
    // 8. Return { success, newLevel, specialStatAdded, specialStatLost[] }
  });
}
```

### 7.3 Update: `server/src/services/equipmentEffects.service.ts`

Extend `EquipmentEffectSummary` with new enchantment special-stat fields:

```typescript
export interface EquipmentEffectSummary {
  // ... existing fields ...

  // Enchantment special stats (aggregated across all equipped items)
  enchantExpGainPct:              number;  // bonus EXP multiplier
  enchantDurabilityProtectPct:    number;  // durability decay reduction
  enchantRareDropPct:             number;  // rare drop bonus
  enchantHarvestQtyBonus:         number;  // flat harvest bonus
  enchantMarketTaxDiscountPct:    number;  // market tax discount
  enchantTaskHungerCostPct:       number;  // task hunger cost reduction
  enchantMaxHungerFlat:           number;  // flat max hunger
  enchantCookDoubleChancePct:     number;  // cook double yield chance
  enchantMineYieldBonusPct:       number;  // mine yield bonus
  enchantSatietyBuffDurationPct:  number;  // satiety buff duration extension
  enchantIngredientSaveExtraPct:  number;  // extra ingredient save chance
  enchantWorkSpeedPct:            number;  // universal work speed bonus
}
```

In the `getUserEquipmentEffects` query, also `SELECT enchant_level, special_stat_1, special_stat_2, special_stat_3, special_stat_4 FROM user_equipments` and loop over active special stats, adding `SPECIAL_STAT_VALUES[key]` to the corresponding field.

Additionally, apply the **enchant base bonus** to the existing effect calculation:

```typescript
const enchantBonus = ENCHANT_BONUS_MULTIPLIER[row.enchant_level ?? 0] ?? 0;
const v = Number(row.effect_value ?? 0) * multiplier * (1 + enchantBonus);
```

### 7.4 New Controller: `server/src/controllers/enchantment.controller.ts`

| Endpoint | Method | Description |
|:---|:---|:---|
| `POST /game/enchant/attempt` | POST | Attempt to enchant an item. Body: `{ inventorySlotId }` |
| `GET /game/enchant/preview/:slotId` | GET | Returns cost preview and current item enchant state |

### 7.5 Route Registration: `server/src/routes/game.routes.ts`

```typescript
import { attemptEnchant, getEnchantPreview } from "../controllers/enchantment.controller";

router.post("/enchant/attempt", authMiddleware, attemptEnchant);
router.get("/enchant/preview/:slotId", authMiddleware, getEnchantPreview);
```

### 7.6 Integration Touch Points

| File | Change |
|:---|:---|
| `hunger.service.ts` | Apply `enchantTaskHungerCostPct` to per-task decay multiplier |
| `workspace.controller.ts` | Apply `enchantWorkSpeedPct` to work order `completes_at` calculation; apply `enchantHarvestQtyBonus` on collect; apply `enchantMineYieldBonusPct` on mine collect; apply `enchantCookDoubleChancePct` on cook collect |
| `level.service.ts` | Multiply EXP awarded by `(1 + enchantExpGainPct)` |
| `durability.service.ts` | Multiply decay by `(1 - enchantDurabilityProtectPct)` before subtracting |
| `market.controller.ts` | Subtract `enchantMarketTaxDiscountPct` from final tax percentage (floor at 0%) |
| `hunger.service.ts` | Add `enchantMaxHungerFlat` to effective max hunger cap; apply `enchantSatietyBuffDurationPct` when setting `buff_expires_at` |
| `inventory.controller.ts` | Persist `enchant_level` + `special_stat_1..4` when equipping/unequipping; include fields in getInventory response |
| `quest.service.ts` | Include enchanted items in reward collection as-is (no rarity downgrade) |

---

## 8. Frontend Implementation

### 8.1 Type Extensions (`client/src/lib/equipmentRarity.ts` or new `enchantment.ts`)

```typescript
export const ENCHANT_BONUS_MULTIPLIER: Record<number, number> = {
  0: 0, 1: 0.05, 2: 0.10, 3: 0.18, 4: 0.25, 5: 0.33,
  6: 0.44, 7: 0.55, 8: 0.68, 9: 0.83, 10: 1.00, 11: 1.20, 12: 1.50,
};

export const ENCHANT_LEVEL_COLOR: Record<number, string> = {
  0: 'rgba(255,255,255,0.4)',
  1: '#a3e635', 2: '#a3e635', 3: '#34d399',  // +1–+3 green
  4: '#38bdf8', 5: '#38bdf8', 6: '#818cf8',  // +4–+6 blue→indigo
  7: '#a78bfa', 8: '#a78bfa', 9: '#f472b6',  // +7–+9 violet→pink
  10: '#fb923c', 11: '#fb923c', 12: '#facc15', // +10–+12 orange→gold
};

export const SPECIAL_STAT_LABELS: Record<string, string> = {
  enchant_exp_gain_pct:              'EXP Gain +8%',
  enchant_durability_protect_pct:    'Durability Loss −12%',
  enchant_rare_drop_pct:             'Rare Drop +3%',
  enchant_harvest_qty_bonus:         '+1 Harvest Qty',
  enchant_market_tax_discount_pct:   'Market Tax −2%',
  enchant_task_hunger_cost_pct:      'Task Hunger −8%',
  enchant_max_hunger_flat:           'Max Hunger +150',
  enchant_cook_double_chance_pct:    'Cook Double +4%',
  enchant_mine_yield_bonus_pct:      'Mine Yield +5%',
  enchant_satiety_buff_duration_pct: 'Buff Duration +15%',
  enchant_ingredient_save_extra_pct: 'Ingredient Save +5%',
  enchant_work_speed_pct:            'Work Speed +4%',
};
```

### 8.2 New Component: `EnchantModal.tsx`

Location: `client/src/components/workspaces/EnchantModal.tsx` (accessible from Textilis workspace)

**UI Structure:**
```
┌──────────────────────────────────────────────┐
│  ✨ Enchant Equipment                         │
│                                              │
│  [Item Icon] Fork (LEGENDARY) +5             │
│  ──────────────────────────────────────────  │
│  Base Effect:  Farm Time −40% → −53.2% (+5) │
│  Special Stats: [SS-01: EXP +8%] [SS-03: ...]│
│                                              │
│  ── Attempt +6 ───────────────────────────── │
│  Cost: 5× Enchant Stone + 300g               │
│  Success Rate: 10%                           │
│  Failure: Level drops to +5 (no stat loss)  │
│                                              │
│        [ ENCHANT ]   [ CANCEL ]              │
└──────────────────────────────────────────────┘
```

**State:** loading, idle, animating (success/fail), result.
**Animation:** `framer-motion` glow pulse on success; screen shake on failure at high levels.

### 8.3 Update: `InventoryGrid.tsx`

- Add `enchant_level` badge on item card (e.g., `+5` in the corner).
- Color badge using `ENCHANT_LEVEL_COLOR[level]`.
- Tooltip on hover shows special stats.

### 8.4 Update: `DashboardPage.tsx` — `formatEquipmentEffect`

Extend to also render enchant bonus and special stats in the equipment buff sidebar:

```typescript
// Enchantment base bonus
const enchantBonus = ENCHANT_BONUS_MULTIPLIER[eq.enchant_level ?? 0] ?? 0;
const effectiveV = rawV * (1 + enchantBonus);

// Special stats display
const specialStats = [eq.special_stat_1, eq.special_stat_2, eq.special_stat_3, eq.special_stat_4]
  .filter(Boolean)
  .map(s => SPECIAL_STAT_LABELS[s!])
  .join(' | ');
```

### 8.5 Update: `MarketplacePage.tsx`

- Show enchant level badge on market listing cards.
- Add `enchant_level` filter (0 = unenchanted, 1–12).
- Sort by enchant level option.

### 8.6 Update: `gameStore.ts`

- Cache `enchantedEffects` as part of the player profile fetch.
- Rehydrate on inventory equip/unequip changes.
- Include `special_stat_1..4` and `enchant_level` in InventorySlot and UserEquipment interfaces.

### 8.7 New Workspace Panel: `TextilisWorkspace.tsx` (if not yet existing)

Add an **Enchantment Forge** section alongside the existing SEW workspace:
- Lists all EQUIPMENT items in current inventory with their enchant state.
- "Enchant" button opens `EnchantModal`.
- Shows Enchant Stone / Rune Shard / Arcane Crystal stock from inventory.

---

## 9. Integration Summary

### 9.1 How Enchant Stats Sync to Systems

| System | Enchant Base Bonus | Special Stats Applied |
|:---|:---|:---|
| **Farm Task** | `effectiveStat *= (1 + enchantBonus)` for `farm_time_reduction_pct`, `farm_double_yield_chance` | `enchantHarvestQtyBonus`, `enchantWorkSpeedPct`, `enchantTaskHungerCostPct`, `enchantRareDropPct` |
| **Cook Task** | Applies to `cook_time_reduction_pct`, `cook_secondary_ingredient_save_chance` | `enchantCookDoubleChancePct`, `enchantWorkSpeedPct`, `enchantIngredientSaveExtraPct`, `enchantTaskHungerCostPct` |
| **Mine Task** | Applies to `hunger_penalty_tier_reduction` | `enchantMineYieldBonusPct`, `enchantHarvestQtyBonus`, `enchantWorkSpeedPct`, `enchantRareDropPct` |
| **Smelt Task** | Applies to base smelt stats | `enchantCookDoubleChancePct` (alloy bonus), `enchantWorkSpeedPct` |
| **Hunger** | Applies to `max_hunger_bonus`, `hunger_decay_reduction_per_min` | `enchantMaxHungerFlat`, `enchantTaskHungerCostPct`, `enchantSatietyBuffDurationPct` |
| **Inventory** | Display only | None (display enchant_level badge) |
| **Market** | Carry `enchant_level` + `special_stat_*` on listing | `enchantMarketTaxDiscountPct` applied at purchase |
| **Durability** | Enchant level does NOT affect durability decay (only protect special stat does) | `enchantDurabilityProtectPct` |
| **EXP / Level** | No direct connection | `enchantExpGainPct` multiplied on EXP award |

---

## 10. Phased Rollout

### Phase 1 — Foundation (Week 1-2)
- [ ] Add new items to `master-data.json` (Fiber Seed, Fiber Thread, Enchant Stone, Rune Shard, Arcane Crystal).
- [ ] Add enchantment recipes to `master-data.json`.
- [ ] Write and run schema migrations (`enchant_level`, `special_stat_1..4` on 3 tables).
- [ ] Update `schema.prisma` models.
- [ ] Add constants to `shared/gameConfig.ts`.

### Phase 2 — Service + Controller (Week 2-3)
- [ ] Implement `enchantment.service.ts` (`attemptEnchant`, `getEnchantCostPreview`, helper functions).
- [ ] Implement `enchantment.controller.ts`.
- [ ] Register routes in `game.routes.ts`.
- [ ] Extend `EquipmentEffectSummary` + `getUserEquipmentEffects` in `equipmentEffects.service.ts`.
- [ ] Unit tests for success/failure roll logic and milestone special-stat assignment.

### Phase 3 — Integration (Week 3-4)
- [ ] `workspace.controller.ts`: Apply `enchantWorkSpeedPct`, `enchantHarvestQtyBonus`, `enchantMineYieldBonusPct`, `enchantCookDoubleChancePct`.
- [ ] `hunger.service.ts`: Apply `enchantTaskHungerCostPct`, `enchantMaxHungerFlat`, `enchantSatietyBuffDurationPct`.
- [ ] `durability.service.ts`: Apply `enchantDurabilityProtectPct`.
- [ ] `level.service.ts`: Apply `enchantExpGainPct`.
- [ ] `market.controller.ts`: Apply `enchantMarketTaxDiscountPct`; carry enchant fields on listings.
- [ ] `inventory.controller.ts`: Persist enchant fields on equip/unequip; include in API response.

### Phase 4 — Frontend (Week 4-5)
- [ ] Create `client/src/lib/enchantment.ts` with all client-side constants/helpers.
- [ ] Update `InventoryGrid.tsx` with enchant badge.
- [ ] Create `EnchantModal.tsx`.
- [ ] Update `DashboardPage.tsx` equipment buff display.
- [ ] Update `MarketplacePage.tsx` for enchant level display and filtering.
- [ ] Update `gameStore.ts` interfaces and state.
- [ ] Add Enchantment Forge section to `TextilisWorkspace.tsx`.

### Phase 5 — Polish & Balance (Week 5-6)
- [ ] Add i18n strings for all new enchantment UI text.
- [ ] Animate `EnchantModal` (success glow, failure shake with `framer-motion`).
- [ ] Soft-cap review: verify cumulative enchant bonuses don't exceed existing clamp limits.
- [ ] Economy balance: tune gold costs and material recipe times based on playtest.
- [ ] Add `enchant_level` and `special_stat_*` to `RepairEquipmentModal.tsx` display.
- [ ] Admin endpoint to reset enchant level (for moderation).

---

## 11. Key Design Decisions & Constraints

| Decision | Rationale |
|:---|:---|
| No item destruction on failure | Keeps high-level enchanting dangerous but not punishing to new players. Failure drop is enough loss. |
| Materials consumed on failure | Ensures Textilis economy remains active; prevents trivial max-level enchanting. |
| Special stats per-item, not per-slot | Stats travel with the item so market listings retain value. |
| Enchant level carries through equip/unequip | DB columns on both `inventory_slots` and `user_equipments` to persist state across both locations. |
| Soft caps on cumulative bonuses | Existing `clamp()` calls in `equipmentEffects.service.ts` prevent stat overflow. Special stat bonuses are additive but small per-piece and subject to the same caps. |
| Textilis-only enchanting (suggested) | Drives cross-city travel and economic interdependence. Can be relaxed to global if needed. |
