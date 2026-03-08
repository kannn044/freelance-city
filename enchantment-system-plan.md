# Equipment Enchantment System — Implementation Plan

## 1. Overview

The **Enchantment System** lets players power up equipment beyond the base rarity cap. Two cities support enchanting:

| City | Workshop | Items Enchanted | Workspace Type |
|:---|:---|:---|:---|
| **Textilis** | Enchantment Loom | Armor & Clothing (HEAD, UPPER_BODY, LOWER_BODY, GLOVE, SHOE) | SEW |
| **Ferrum** | Upgrade Forge | Tools & Weapons (ARM slot — Mattock, Fork, etc.) | SMELT |

Each item enchants from **+0** to **+12**, amplifying base stats and unlocking **Special Stats** at milestone levels (+3, +6, +9, +12). Textilis and Ferrum maintain **separate special stat pools** matched to their item types.

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

| Zone | Levels | On Failure |
|:---|:---|:---|
| **Safe Zone** | +1 to +5 | Drop 1 level. **Floor at +1** — failing at +1 stays at +1, cannot reach +0. |
| **Danger Zone** | +6 to +9 | Drop 1 level **+ 50% chance to destroy the item entirely**. |
| **Extreme Zone** | +10 to +12 | Drop 2 levels **+ 50% chance to destroy the item entirely**. |

> If the item is destroyed, it is removed from the inventory slot permanently and all enchant data is lost.

**Failure pseudocode:**
```typescript
function resolveFailure(currentLevel: number): FailureResult {
  const drop = ENCHANT_FAILURE_DROP[currentLevel];
  const newLevel = Math.max(currentLevel - drop, ENCHANT_LEVEL_FLOOR); // floor at +1

  const inDestroyZone = currentLevel >= ENCHANT_DESTROY_ZONE_MIN;
  const destroyed = inDestroyZone && Math.random() < ENCHANT_DESTROY_CHANCE;

  if (destroyed) return { destroyed: true, newLevel: 0 };
  return { destroyed: false, newLevel };
}
```

### 2.3 Milestone Levels (+3 / +6 / +9 / +12)

When an item **successfully reaches** a milestone, the system assigns **one Special Stat** chosen at random from the city-specific pool (excluding already assigned stats). Dropping below a milestone clears those stats; re-reaching it re-rolls fresh.

---

## 3. Enchantment Materials

### 3.1 Textilis Materials (crafted via Tailor — SEW workspace)

| Material | Craft Time | Ingredients | Used For |
|:---|:---|:---|:---|
| **Enchant Stone** | 5 min | 3× Fiber Thread + 1× Salt | +1 to +5 |
| **Rune Shard** | 15 min | 2× Enchant Stone + 1× Iron Ingot + 1× Flux | +6 to +9 |
| **Arcane Crystal** | 40 min | 2× Rune Shard + 1× Steel Ingot + 1× Oil | +10 to +12 |

### 3.2 Ferrum Materials (crafted via Blacksmith — SMELT workspace)

| Material | Craft Time | Ingredients | Used For |
|:---|:---|:---|:---|
| **Metal Dust** | 5 min | 3× Iron Ore + 1× Coal | +1 to +5 |
| **Rune Ingot** | 15 min | 2× Metal Dust + 1× Steel Bar + 1× Flux | +6 to +9 |
| **Chaos Core** | 40 min | 2× Rune Ingot + 1× Alloy Bar + 1× Oil | +10 to +12 |

### 3.3 Material + Gold Cost per Attempt (both cities share the same scale)

| Enchant Attempt | Textilis Material | Ferrum Material | Gold Cost |
|:---:|:---|:---|:---:|
| +0 → +1 | 3× Enchant Stone | 3× Metal Dust | 500g |
| +1 → +2 | 5× Enchant Stone | 5× Metal Dust | 1,000g |
| +2 → +3 | 10× Enchant Stone | 10× Metal Dust | 2,000g |
| +3 → +4 | 15× Enchant Stone | 15× Metal Dust | 4,000g |
| +4 → +5 | 30× Enchant Stone | 30× Metal Dust | 8,000g |
| +5 → +6 | 10× Rune Shard | 10× Rune Ingot | 12,000g |
| +6 → +7 | 20× Rune Shard | 20× Rune Ingot | 18,000g |
| +7 → +8 | 30× Rune Shard | 30× Rune Ingot | 24,000g |
| +8 → +9 | 10× Arcane Crystal | 10× Chaos Core | 28,000g |
| +9 → +10 | 20× Arcane Crystal | 20× Chaos Core | 40,000g |
| +10 → +11 | 30× Arcane Crystal | 30× Chaos Core | 90,000g |

Materials are **consumed on attempt** regardless of success or failure.

---

## 4. Base Stat Scaling (Enchant Bonus Multiplier)

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

> Example: LEGENDARY Fork (farm_time_reduction_pct base 0.40, rarity 1.0x) at +12 → 0.40 × 1.0 × 2.50 = 100% (capped at 80% system max).

---

## 5. Special Stat Pools

### 5.1 Textilis Pool — Armor & Clothing (T-01 to T-12)

| ID | Effect Key | Description | Value per Stack |
|:---:|:---|:---|:---:|
| T-01 | `enchant_exp_gain_pct` | Bonus EXP from all work orders | +8% |
| T-02 | `enchant_durability_protect_pct` | Reduces equipment durability decay rate | −12% |
| T-03 | `enchant_rare_drop_pct` | Increases chance of Rare/Epic/Legendary harvest | +3% |
| T-04 | `enchant_harvest_qty_bonus` | Bonus item qty on FARM/EXTRACT/GATHER/FORAGE | +1 qty |
| T-05 | `enchant_market_tax_discount_pct` | Reduces all market taxes | −2% |
| T-06 | `enchant_task_hunger_cost_pct` | Reduces hunger burned per active task | −8% |
| T-07 | `enchant_max_hunger_flat` | Flat max hunger capacity bonus | +150 Kcal |
| T-08 | `enchant_cook_double_chance_pct` | Chance to produce double output on COOK | +4% |
| T-09 | `enchant_satiety_buff_duration_pct` | Extends meal satiety buff duration | +15% |
| T-10 | `enchant_ingredient_save_extra_pct` | Extra chance to save all ingredients on COOK | +5% |
| T-11 | `enchant_work_speed_pct` | Universal work speed bonus (all task types) | +4% |
| T-12 | `enchant_gourmet_chance_pct` | Bonus chance to produce Gourmet quality meals | +3% |

### 5.2 Ferrum Pool — Tools (F-01 to F-12)

| ID | Effect Key | Description | Value per Stack |
|:---:|:---|:---|:---:|
| F-01 | `enchant_expedition_speed_pct` | Reduces expedition travel time | −10% |
| F-02 | `enchant_ore_double_chance_pct` | Chance to double ore yield on MINE | +6% |
| F-03 | `enchant_gem_find_pct` | Extra chance to find gems during MINE | +4% |
| F-04 | `enchant_smelt_speed_pct` | Reduces SMELT task completion time | −8% |
| F-05 | `enchant_alloy_bonus_pct` | Bonus output qty on SMELT alloy recipes | +5% |
| F-06 | `enchant_deep_hunger_reduction_pct` | Reduces hunger drain during MINE/SMELT | −10% |
| F-07 | `enchant_tool_durability_protect_pct` | ARM-slot tool durability decay reduction | −15% |
| F-08 | `enchant_farm_yield_flat` | Flat bonus qty on FARM collect | +1 qty |
| F-09 | `enchant_mine_rare_ore_pct` | Chance to find rare ore type during MINE | +3% |
| F-10 | `enchant_craft_exp_bonus_pct` | Bonus EXP from SMELT/MINE work orders | +10% |
| F-11 | `enchant_forge_double_chance_pct` | Chance to produce double output on SMELT | +5% |
| F-12 | `enchant_resource_save_pct` | Chance to not consume input materials on SMELT | +4% |

### 5.3 Milestone → Special Stat Assignment

```
+3  reached → Roll 1 stat from cityPool (no duplicates) → special_stat_1
+6  reached → Roll 1 stat from cityPool minus assigned  → special_stat_2
+9  reached → Roll 1 stat from cityPool minus assigned  → special_stat_3
+12 reached → Roll 1 stat from cityPool minus assigned  → special_stat_4
```

Dropping below a milestone **clears** that stat slot. Re-reaching the milestone re-rolls fresh.

---

## 6. Dynamic Architecture

The enchantment system uses a **city config registry** — adding a new enchanting city requires zero changes to service logic, routes, or the `EnchantModal` component. Only a new config entry is needed.

### 6.1 `CityEnchantConfig` Type (`shared/gameConfig.ts`)

```typescript
export type EquipmentSlotKey = "HEAD" | "UPPER_BODY" | "LOWER_BODY" | "ARM" | "GLOVE" | "SHOE";

export interface EnchantMaterialTier {
  itemName: string;
  forLevels: [number, number]; // [minLevel, maxLevel] inclusive
}

export interface CityEnchantConfig {
  cityKey: string;
  workshopLabel: string;
  craftWorkType: string;                  // WorkType that crafts materials
  uiTheme: {
    primaryColor: string;                 // Hex color for glow/buttons/badges
    icon: string;                         // Lucide icon name
    gradientFrom: string;
    gradientTo: string;
  };
  applicableSlots: EquipmentSlotKey[];    // Which slots this city can enchant
  materialChain: EnchantMaterialTier[];   // 3-tier material chain
  materialCost: Record<number, { qty: number; gold: number }>;
  specialStatPool: string[];              // Pool of stat keys for this city
}
```

### 6.2 `CITY_ENCHANT_CONFIGS` Registry (`shared/gameConfig.ts`)

```typescript
export const CITY_ENCHANT_CONFIGS: Record<string, CityEnchantConfig> = {

  textilis: {
    cityKey: "textilis",
    workshopLabel: "Enchantment Loom",
    craftWorkType: "SEW",
    uiTheme: {
      primaryColor: "#a78bfa",
      icon: "Sparkles",
      gradientFrom: "#4c1d95",
      gradientTo: "#7c3aed",
    },
    applicableSlots: ["HEAD", "UPPER_BODY", "LOWER_BODY", "GLOVE", "SHOE"],
    materialChain: [
      { itemName: "Enchant Stone",  forLevels: [1, 5] },
      { itemName: "Rune Shard",     forLevels: [6, 9] },
      { itemName: "Arcane Crystal", forLevels: [10, 12] },
    ],
    materialCost: {
      1:  { qty: 3,  gold: 500   },
      2:  { qty: 5,  gold: 1000  },
      3:  { qty: 10, gold: 2000  },
      4:  { qty: 15, gold: 4000  },
      5:  { qty: 30, gold: 8000  },
      6:  { qty: 10, gold: 12000 },
      7:  { qty: 20, gold: 18000 },
      8:  { qty: 30, gold: 24000 },
      9:  { qty: 10, gold: 28000 },
      10: { qty: 20, gold: 40000 },
      11: { qty: 30, gold: 90000 },
    },
    specialStatPool: [
      "enchant_exp_gain_pct", "enchant_durability_protect_pct", "enchant_rare_drop_pct",
      "enchant_harvest_qty_bonus", "enchant_market_tax_discount_pct", "enchant_task_hunger_cost_pct",
      "enchant_max_hunger_flat", "enchant_cook_double_chance_pct", "enchant_satiety_buff_duration_pct",
      "enchant_ingredient_save_extra_pct", "enchant_work_speed_pct", "enchant_gourmet_chance_pct",
    ],
  },

  ferrum: {
    cityKey: "ferrum",
    workshopLabel: "Upgrade Forge",
    craftWorkType: "SMELT",
    uiTheme: {
      primaryColor: "#fb923c",
      icon: "Flame",
      gradientFrom: "#7c2d12",
      gradientTo: "#c2410c",
    },
    applicableSlots: ["ARM"],
    materialChain: [
      { itemName: "Metal Dust",  forLevels: [1, 5] },
      { itemName: "Rune Ingot",  forLevels: [6, 9] },
      { itemName: "Chaos Core",  forLevels: [10, 12] },
    ],
    materialCost: {
      1:  { qty: 3,  gold: 500   },
      2:  { qty: 5,  gold: 1000  },
      3:  { qty: 10, gold: 2000  },
      4:  { qty: 15, gold: 4000  },
      5:  { qty: 30, gold: 8000  },
      6:  { qty: 10, gold: 12000 },
      7:  { qty: 20, gold: 18000 },
      8:  { qty: 30, gold: 24000 },
      9:  { qty: 10, gold: 28000 },
      10: { qty: 20, gold: 40000 },
      11: { qty: 30, gold: 90000 },
    },
    specialStatPool: [
      "enchant_expedition_speed_pct", "enchant_ore_double_chance_pct", "enchant_gem_find_pct",
      "enchant_smelt_speed_pct", "enchant_alloy_bonus_pct", "enchant_deep_hunger_reduction_pct",
      "enchant_tool_durability_protect_pct", "enchant_farm_yield_flat", "enchant_mine_rare_ore_pct",
      "enchant_craft_exp_bonus_pct", "enchant_forge_double_chance_pct", "enchant_resource_save_pct",
    ],
  },

};
```

### 6.3 `SPECIAL_STAT_DEFINITIONS` — Master Record (24 stats)

```typescript
export const SPECIAL_STAT_DEFINITIONS: Record<string, { label: string; value: number; unit: string }> = {
  // Textilis (T-01 to T-12)
  enchant_exp_gain_pct:               { label: "EXP Gain",             value: 0.08,  unit: "+%" },
  enchant_durability_protect_pct:     { label: "Durability Loss",      value: 0.12,  unit: "−%" },
  enchant_rare_drop_pct:              { label: "Rare Drop",            value: 0.03,  unit: "+%" },
  enchant_harvest_qty_bonus:          { label: "Harvest Qty",          value: 1,     unit: "+qty" },
  enchant_market_tax_discount_pct:    { label: "Market Tax",           value: 0.02,  unit: "−%" },
  enchant_task_hunger_cost_pct:       { label: "Task Hunger Cost",     value: 0.08,  unit: "−%" },
  enchant_max_hunger_flat:            { label: "Max Hunger",           value: 150,   unit: "+Kcal" },
  enchant_cook_double_chance_pct:     { label: "Cook Double",          value: 0.04,  unit: "+%" },
  enchant_satiety_buff_duration_pct:  { label: "Buff Duration",        value: 0.15,  unit: "+%" },
  enchant_ingredient_save_extra_pct:  { label: "Ingredient Save",      value: 0.05,  unit: "+%" },
  enchant_work_speed_pct:             { label: "Work Speed",           value: 0.04,  unit: "+%" },
  enchant_gourmet_chance_pct:         { label: "Gourmet Chance",       value: 0.03,  unit: "+%" },
  // Ferrum (F-01 to F-12)
  enchant_expedition_speed_pct:       { label: "Expedition Speed",     value: 0.10,  unit: "−%" },
  enchant_ore_double_chance_pct:      { label: "Ore Double",           value: 0.06,  unit: "+%" },
  enchant_gem_find_pct:               { label: "Gem Find",             value: 0.04,  unit: "+%" },
  enchant_smelt_speed_pct:            { label: "Smelt Speed",          value: 0.08,  unit: "−%" },
  enchant_alloy_bonus_pct:            { label: "Alloy Bonus",          value: 0.05,  unit: "+%" },
  enchant_deep_hunger_reduction_pct:  { label: "Deep Task Hunger",     value: 0.10,  unit: "−%" },
  enchant_tool_durability_protect_pct:{ label: "Tool Durability Loss", value: 0.15,  unit: "−%" },
  enchant_farm_yield_flat:            { label: "Farm Yield",           value: 1,     unit: "+qty" },
  enchant_mine_rare_ore_pct:          { label: "Rare Ore Find",        value: 0.03,  unit: "+%" },
  enchant_craft_exp_bonus_pct:        { label: "Craft EXP",            value: 0.10,  unit: "+%" },
  enchant_forge_double_chance_pct:    { label: "Forge Double",         value: 0.05,  unit: "+%" },
  enchant_resource_save_pct:          { label: "Resource Save",        value: 0.04,  unit: "+%" },
};
```

### 6.4 Utility Helpers (`shared/enchantmentUtils.ts`)

```typescript
import { CITY_ENCHANT_CONFIGS, CityEnchantConfig, EquipmentSlotKey } from "./gameConfig";

/** Returns the config for whichever city enchants the given equipment slot. */
export function getCityEnchantConfigForSlot(slot: EquipmentSlotKey): CityEnchantConfig | undefined {
  return Object.values(CITY_ENCHANT_CONFIGS).find(cfg => cfg.applicableSlots.includes(slot));
}

/** Returns the material name for a given target level within a config. */
export function getMaterialForLevel(cfg: CityEnchantConfig, targetLevel: number): string {
  const tier = cfg.materialChain.find(
    t => targetLevel >= t.forLevels[0] && targetLevel <= t.forLevels[1]
  );
  return tier?.itemName ?? "Unknown Material";
}
```

---

## 7. Shared Constants (`shared/gameConfig.ts`)

```typescript
// ─── Enchantment System ──────────────────────────────────────────────────────

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

/**
 * How many levels to drop on failure. Key = target level being attempted.
 * Levels 1-5: drop 1 but floor at ENCHANT_LEVEL_FLOOR (item cannot reach +0).
 * Levels 6-9: drop 1 + 50% destroy chance.
 * Levels 10-12: drop 2 + 50% destroy chance.
 */
export const ENCHANT_FAILURE_DROP: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1,   // safe zone — floor applied
  6: 1, 7: 1, 8: 1, 9: 1,          // danger zone — destroy risk
  10: 2, 11: 2, 12: 2,              // extreme zone — destroy risk
};

export const ENCHANT_LEVEL_FLOOR      = 1;    // Cannot drop below +1 in safe zone
export const ENCHANT_DESTROY_ZONE_MIN = 6;    // Levels >= 6 have destroy risk on failure
export const ENCHANT_DESTROY_CHANCE   = 0.50; // 50% item destroy on failure in danger/extreme zones

// Material costs live inside CITY_ENCHANT_CONFIGS (see Section 6.2).
// CITY_ENCHANT_CONFIGS.textilis.materialCost[targetLevel] → { qty, gold }
// CITY_ENCHANT_CONFIGS.ferrum.materialCost[targetLevel]   → { qty, gold }
```

---

## 8. Backend Implementation

### 8.1 New Service: `server/src/services/enchantment.service.ts`

```typescript
export async function attemptEnchant(
  userId: number,
  inventorySlotId: number,
  db = prisma
): Promise<EnchantAttemptResult> {
  return db.$transaction(async (tx) => {
    // 1. Load slot — must be EQUIPMENT, must belong to user
    const slot = await tx.inventorySlot.findFirstOrThrow({
      where: { id: inventorySlotId, user_id: userId },
    });
    const item = await tx.item.findUniqueOrThrow({ where: { id: slot.item_id } });

    // 2. Resolve city config from equipment slot dynamically
    const cfg = getCityEnchantConfigForSlot(item.equipment_slot as EquipmentSlotKey);
    if (!cfg) throw new Error("Item slot is not enchantable");

    // 3. Validate player is in the correct city
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.current_city !== cfg.cityKey)
      throw new Error(`Must be in ${cfg.workshopLabel} to enchant this item`);

    const targetLevel = (slot.enchant_level ?? 0) + 1;
    if (targetLevel > 12) throw new Error("Already at maximum enchant level +12");

    // 4. Deduct material + gold
    const cost = cfg.materialCost[targetLevel];
    const materialName = getMaterialForLevel(cfg, targetLevel);
    await deductMaterialFromInventory(userId, materialName, cost.qty, tx);
    await tx.user.update({
      where: { id: userId },
      data: { money: { decrement: cost.gold } },
    });

    // 5. Roll success
    const success = Math.random() < ENCHANT_SUCCESS_RATES[targetLevel];

    if (success) {
      const newLevel = targetLevel;
      let specialStatAdded: string | null = null;

      const statUpdate: Record<string, string | null> = {};
      if ((ENCHANT_MILESTONES as readonly number[]).includes(newLevel)) {
        const existing = [slot.special_stat_1, slot.special_stat_2,
                          slot.special_stat_3, slot.special_stat_4].filter(Boolean) as string[];
        specialStatAdded = pickRandomStat(cfg.specialStatPool, existing);
        statUpdate[milestoneToStatKey(newLevel)] = specialStatAdded;
      }

      await tx.inventorySlot.update({
        where: { id: inventorySlotId },
        data: { enchant_level: newLevel, ...statUpdate },
      });

      return { success: true, newLevel, specialStatAdded, destroyed: false };

    } else {
      // 6. Failure resolution
      const currentLevel = slot.enchant_level ?? 0;
      const drop = ENCHANT_FAILURE_DROP[targetLevel] ?? 0;
      const newLevel = Math.max(currentLevel - drop, ENCHANT_LEVEL_FLOOR);

      const inDestroyZone = currentLevel >= ENCHANT_DESTROY_ZONE_MIN;
      const destroyed = inDestroyZone && Math.random() < ENCHANT_DESTROY_CHANCE;

      if (destroyed) {
        await tx.inventorySlot.delete({ where: { id: inventorySlotId } });
        return { success: false, newLevel: 0, destroyed: true, specialStatAdded: null };
      }

      // Clear stats for milestones above new level
      const clearedStats = clearStatsAboveLevel(slot, newLevel);
      await tx.inventorySlot.update({
        where: { id: inventorySlotId },
        data: { enchant_level: newLevel, ...clearedStats },
      });

      return { success: false, newLevel, destroyed: false, specialStatAdded: null };
    }
  });
}
```

### 8.2 Update: `server/src/services/equipmentEffects.service.ts`

Extend `EquipmentEffectSummary` with all 24 special-stat fields plus enchant base bonus:

```typescript
export interface EquipmentEffectSummary {
  // ...existing 12 fields...

  // Textilis special stats (T-01 to T-12)
  enchantExpGainPct:              number;
  enchantDurabilityProtectPct:    number;
  enchantRareDropPct:             number;
  enchantHarvestQtyBonus:         number;
  enchantMarketTaxDiscountPct:    number;
  enchantTaskHungerCostPct:       number;
  enchantMaxHungerFlat:           number;
  enchantCookDoubleChancePct:     number;
  enchantSatietyBuffDurationPct:  number;
  enchantIngredientSaveExtraPct:  number;
  enchantWorkSpeedPct:            number;
  enchantGourmetChancePct:        number;

  // Ferrum special stats (F-01 to F-12)
  enchantExpeditionSpeedPct:       number;
  enchantOreDoubleChancePct:       number;
  enchantGemFindPct:               number;
  enchantSmeltSpeedPct:            number;
  enchantAlloyBonusPct:            number;
  enchantDeepHungerReductionPct:   number;
  enchantToolDurabilityProtectPct: number;
  enchantFarmYieldFlat:            number;
  enchantMineRareOrePct:           number;
  enchantCraftExpBonusPct:         number;
  enchantForgeDoubleChancePct:     number;
  enchantResourceSavePct:          number;
}
```

Apply enchant base bonus when aggregating effect values:

```typescript
const enchantBonus = ENCHANT_BONUS_MULTIPLIER[row.enchant_level ?? 0] ?? 0;
const effectiveValue = baseValue * rarityMultiplier * (1 + enchantBonus);
```

Loop over `special_stat_1..4` for each equipped item and accumulate via `SPECIAL_STAT_DEFINITIONS[key].value`.

### 8.3 New Controller: `server/src/controllers/enchantment.controller.ts`

| Endpoint | Method | Description |
|:---|:---|:---|
| `POST /game/enchant/attempt` | POST | Attempt enchant. Body: `{ inventorySlotId }` |
| `GET /game/enchant/preview/:slotId` | GET | Cost preview + current enchant state |
| `GET /game/enchant/configs` | GET | Returns `CITY_ENCHANT_CONFIGS` for client use |

### 8.4 Routes: `server/src/routes/game.routes.ts`

```typescript
import { attemptEnchant, getEnchantPreview, getEnchantConfigs } from "../controllers/enchantment.controller";

router.post("/enchant/attempt",        authMiddleware, attemptEnchant);
router.get("/enchant/preview/:slotId", authMiddleware, getEnchantPreview);
router.get("/enchant/configs",         authMiddleware, getEnchantConfigs);
```

### 8.5 Integration Touch Points

| File | Change |
|:---|:---|
| `workspace.controller.ts` | Apply `enchantWorkSpeedPct`, `enchantHarvestQtyBonus`, `enchantMineRareOrePct`, `enchantOreDoubleChancePct`, `enchantCookDoubleChancePct`, `enchantForgeDoubleChancePct`, `enchantResourceSavePct`, `enchantFarmYieldFlat` on collect |
| `hunger.service.ts` | Apply `enchantTaskHungerCostPct`, `enchantDeepHungerReductionPct`, `enchantMaxHungerFlat`, `enchantSatietyBuffDurationPct` |
| `durability.service.ts` | `enchantDurabilityProtectPct` for armor; `enchantToolDurabilityProtectPct` for ARM-slot items |
| `level.service.ts` | Multiply EXP by `(1 + enchantExpGainPct + enchantCraftExpBonusPct)` |
| `market.controller.ts` | Subtract `enchantMarketTaxDiscountPct` from tax (floor 0%); carry enchant fields on listings |
| `inventory.controller.ts` | Persist `enchant_level` + `special_stat_1..4` on equip/unequip; include in API response |

---

## 9. Database Schema Changes

### 9.1 New Items (`master-data.json`)

**Textilis:**
```json
{ "name": "Fiber Seed",     "type": "SEED",       "max_stack": 10, "buy_price": 30,  "yield_item": "Fiber Thread", "yield_qty": 3, "grow_mins": 8 },
{ "name": "Fiber Thread",   "type": "RAW",        "max_stack": 99, "sell_price": 15 },
{ "name": "Enchant Stone",  "type": "INGREDIENT", "max_stack": 99, "sell_price": 40 },
{ "name": "Rune Shard",     "type": "INGREDIENT", "max_stack": 99, "sell_price": 120 },
{ "name": "Arcane Crystal", "type": "INGREDIENT", "max_stack": 20, "sell_price": 600 }
```

**Ferrum:**
```json
{ "name": "Metal Dust", "type": "INGREDIENT", "max_stack": 99, "sell_price": 40 },
{ "name": "Rune Ingot", "type": "INGREDIENT", "max_stack": 99, "sell_price": 120 },
{ "name": "Chaos Core", "type": "INGREDIENT", "max_stack": 20, "sell_price": 600 }
```

### 9.2 Schema Migrations (SQL)

```sql
ALTER TABLE inventory_slots
  ADD COLUMN enchant_level  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1 VARCHAR(60) NULL,
  ADD COLUMN special_stat_2 VARCHAR(60) NULL,
  ADD COLUMN special_stat_3 VARCHAR(60) NULL,
  ADD COLUMN special_stat_4 VARCHAR(60) NULL;

ALTER TABLE user_equipments
  ADD COLUMN enchant_level  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1 VARCHAR(60) NULL,
  ADD COLUMN special_stat_2 VARCHAR(60) NULL,
  ADD COLUMN special_stat_3 VARCHAR(60) NULL,
  ADD COLUMN special_stat_4 VARCHAR(60) NULL;

ALTER TABLE market_listings
  ADD COLUMN enchant_level  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN special_stat_1 VARCHAR(60) NULL,
  ADD COLUMN special_stat_2 VARCHAR(60) NULL,
  ADD COLUMN special_stat_3 VARCHAR(60) NULL,
  ADD COLUMN special_stat_4 VARCHAR(60) NULL;
```

### 9.3 Prisma Schema (`schema.prisma`)

```prisma
model InventorySlot {
  // ...existing fields...
  enchant_level  Int     @default(0)
  special_stat_1 String?
  special_stat_2 String?
  special_stat_3 String?
  special_stat_4 String?
}

model UserEquipment {
  // ...existing fields...
  enchant_level  Int     @default(0)
  special_stat_1 String?
  special_stat_2 String?
  special_stat_3 String?
  special_stat_4 String?
}

model MarketListing {
  // ...existing fields...
  enchant_level  Int     @default(0)
  special_stat_1 String?
  special_stat_2 String?
  special_stat_3 String?
  special_stat_4 String?
}
```

---

## 10. Frontend Implementation

### 10.1 `client/src/lib/enchantment.ts`

```typescript
export const ENCHANT_LEVEL_COLOR: Record<number, string> = {
  0:  "rgba(255,255,255,0.3)",
  1:  "#a3e635", 2:  "#a3e635", 3:  "#34d399",   // green
  4:  "#38bdf8", 5:  "#38bdf8", 6:  "#818cf8",   // blue → indigo
  7:  "#a78bfa", 8:  "#a78bfa", 9:  "#f472b6",   // violet → pink
  10: "#fb923c", 11: "#fb923c", 12: "#facc15",   // orange → gold
};
```

### 10.2 `EnchantModal.tsx` — Single City-Themed Component

The modal is **driven by `CityEnchantConfig`** — one component handles both Textilis and Ferrum.

```typescript
interface EnchantModalProps {
  slot: InventorySlot;
  config: CityEnchantConfig;   // injected — modal has zero city-specific logic
  onClose: () => void;
  onSuccess: (result: EnchantAttemptResult) => void;
}
```

**Textilis (purple) wireframe:**
```
┌──────────────────── ✨ Enchantment Loom ─────────────────────┐
│  [Item Icon]  Cloth Hat (EPIC)  +5                          │
│  ─────────────────────────────────────────────────────────  │
│  Base Effect: Farm Time −30% → −39.9% at +5                │
│  Special Stats: [T-01: EXP +8%] [T-04: +1 Harvest]        │
│                                                             │
│  ── Attempt +6 ──────────────────────────────────────────  │
│  Material: 10× Rune Shard        (you have: 14)            │
│  Gold:     12,000g               (you have: 45,200g)       │
│  Success Rate: 10%                                         │
│  ⚠ Failure: Drop to +5 or 50% DESTROY                     │
│                                                             │
│           [ ENCHANT ]         [ CANCEL ]                   │
└──────────────────────────────────────────────────────────── ┘
```

**Ferrum (orange) wireframe:**
```
┌──────────────────── 🔥 Upgrade Forge ───────────────────────┐
│  [Item Icon]  Iron Fork (LEGENDARY)  +3                     │
│  ─────────────────────────────────────────────────────────  │
│  Base Effect: Farm Time −40% → −47.2% at +3                │
│  Special Stats: [F-01: Expedition −10%]                    │
│                                                             │
│  ── Attempt +4 ──────────────────────────────────────────  │
│  Material: 15× Metal Dust        (you have: 32)            │
│  Gold:     4,000g                (you have: 45,200g)       │
│  Success Rate: 40%                                         │
│  Failure: Drop to +3 (floor — safe zone)                   │
│                                                             │
│           [ FORGE UP ]        [ CANCEL ]                   │
└──────────────────────────────────────────────────────────── ┘
```

**Animation:** purple glow pulse for Textilis success; orange forge spark for Ferrum success; screen shake for high-level failure in both themes.

### 10.3 `TextilisWorkspace.tsx` — Enchantment Loom Section

Add panel after SEW workspace:
- Lists EQUIPMENT items filtered to Textilis `applicableSlots`.
- Shows enchant level badge per item.
- "Enchant" button opens `<EnchantModal config={CITY_ENCHANT_CONFIGS.textilis} ... />`.
- Shows Enchant Stone / Rune Shard / Arcane Crystal stock counts.

### 10.4 `BlacksmithWorkspace.tsx` — Upgrade Forge Section

Add panel after SMELT workspace:
- Lists ARM-slot EQUIPMENT items.
- Shows enchant level badge.
- "Forge Up" button opens `<EnchantModal config={CITY_ENCHANT_CONFIGS.ferrum} ... />`.
- Shows Metal Dust / Rune Ingot / Chaos Core stock counts.

### 10.5 Other Frontend Updates

| File | Change |
|:---|:---|
| `InventoryGrid.tsx` | Enchant level badge (corner) colored by `ENCHANT_LEVEL_COLOR`; tooltip shows special stats |
| `DashboardPage.tsx` | Apply `enchantBonus` in `formatEquipmentEffect`; render special stat labels from `SPECIAL_STAT_DEFINITIONS` |
| `MarketplacePage.tsx` | Show enchant badge on listings; filter + sort by enchant level |
| `gameStore.ts` | Add `enchant_level` + `special_stat_1..4` to `InventorySlot` and `UserEquipment` interfaces |

---

## 11. Integration Summary

| System | Enchant Base Bonus Applied To | Special Stats Applied |
|:---|:---|:---|
| **Farm Task** | `farm_time_reduction_pct`, `farm_double_yield_chance` | `enchantHarvestQtyBonus`, `enchantFarmYieldFlat`, `enchantWorkSpeedPct`, `enchantRareDropPct` |
| **Cook Task** | `cook_time_reduction_pct`, `cook_secondary_ingredient_save_chance` | `enchantCookDoubleChancePct`, `enchantIngredientSaveExtraPct`, `enchantGourmetChancePct` |
| **Mine Task** | `hunger_penalty_tier_reduction` | `enchantOreDoubleChancePct`, `enchantGemFindPct`, `enchantMineRareOrePct`, `enchantExpeditionSpeedPct` |
| **Smelt Task** | base smelt stats | `enchantForgeDoubleChancePct`, `enchantAlloyBonusPct`, `enchantSmeltSpeedPct`, `enchantResourceSavePct` |
| **Hunger** | `max_hunger_bonus`, `hunger_decay_reduction_per_min` | `enchantMaxHungerFlat`, `enchantTaskHungerCostPct`, `enchantDeepHungerReductionPct`, `enchantSatietyBuffDurationPct` |
| **Durability** | — (no base bonus) | `enchantDurabilityProtectPct` (armor), `enchantToolDurabilityProtectPct` (tools) |
| **EXP / Level** | — | `enchantExpGainPct` (all), `enchantCraftExpBonusPct` (MINE/SMELT) |
| **Market** | — | `enchantMarketTaxDiscountPct` at purchase |

---

## 12. Phased Rollout

### Phase 1 — Foundation (Week 1–2)
- [ ] Add Textilis items to `master-data.json` (Fiber Seed, Fiber Thread, Enchant Stone, Rune Shard, Arcane Crystal).
- [ ] Add Ferrum items to `master-data.json` (Metal Dust, Rune Ingot, Chaos Core).
- [ ] Add enchantment recipes for both cities to `master-data.json`.
- [ ] Write schema migrations (3 tables × 5 new columns).
- [ ] Update `schema.prisma` models.
- [ ] Add all constants + `CITY_ENCHANT_CONFIGS` + `SPECIAL_STAT_DEFINITIONS` to `shared/gameConfig.ts`.

### Phase 2 — Service + Controller (Week 2–3)
- [ ] Implement `enchantment.service.ts`.
- [ ] Implement `enchantment.controller.ts` (3 endpoints).
- [ ] Register routes in `game.routes.ts`.
- [ ] Extend `EquipmentEffectSummary` with 24 new fields.
- [ ] Unit tests: floor mechanic, destroy chance, milestone assignment, config resolution.

### Phase 3 — Integration (Week 3–4)
- [ ] `workspace.controller.ts`: 8 enchant special stat applications.
- [ ] `hunger.service.ts`: 4 applications.
- [ ] `durability.service.ts`: 2 applications.
- [ ] `level.service.ts`: EXP multiplier.
- [ ] `market.controller.ts`: tax discount + carry enchant fields.
- [ ] `inventory.controller.ts`: persist + return enchant fields.

### Phase 4 — Frontend (Week 4–5)
- [ ] Create `client/src/lib/enchantment.ts`.
- [ ] Create `EnchantModal.tsx` (config-driven, handles both cities).
- [ ] Update `InventoryGrid.tsx` with enchant badge.
- [ ] Add Enchantment Loom section to `TextilisWorkspace.tsx`.
- [ ] Add Upgrade Forge section to `BlacksmithWorkspace.tsx`.
- [ ] Update `DashboardPage.tsx`, `MarketplacePage.tsx`, `gameStore.ts`.

### Phase 5 — Polish (Week 5–6)
- [ ] i18n strings for all enchantment UI text.
- [ ] `framer-motion` animations (purple glow, orange spark, shake on failure).
- [ ] Soft-cap review: cumulative special stats within existing clamp limits.
- [ ] Economy balance: tune gold costs and craft times from playtest data.
- [ ] Add enchant info to `RepairEquipmentModal.tsx`.
- [ ] Admin endpoint to reset enchant level.

---

## 13. Extensibility Guide

To add a **new enchanting city** (e.g., Agraria enchants harvesting headgear):

1. **Add one entry to `CITY_ENCHANT_CONFIGS`** in `shared/gameConfig.ts`:
   ```typescript
   agraria: {
     cityKey: "agraria",
     workshopLabel: "Harvest Altar",
     craftWorkType: "FARM",
     uiTheme: { primaryColor: "#4ade80", icon: "Leaf", gradientFrom: "#14532d", gradientTo: "#16a34a" },
     applicableSlots: ["HEAD"],
     materialChain: [ /* 3 tiers */ ],
     materialCost: { /* levels 1-11 */ },
     specialStatPool: [ /* 12 agraria-specific stat keys */ ],
   }
   ```

2. **Add 12 new entries to `SPECIAL_STAT_DEFINITIONS`** with `label`, `value`, `unit`.

3. **Add a forge section** to the relevant `*Workspace.tsx` that opens `<EnchantModal config={CITY_ENCHANT_CONFIGS.agraria} ... />`.

4. **Zero changes needed** to: `enchantment.service.ts`, controller, routes, DB schema, or `EnchantModal.tsx`.

> `getCityEnchantConfigForSlot()` resolves the correct config at runtime — the service never hard-codes city names.

---

## 14. Key Design Decisions

| Decision | Rationale |
|:---|:---|
| **Floor at +1 in safe zone** | Prevents players from dropping to +0 accidentally; preserves prior enchanting investment. |
| **50% destroy chance at +6+** | High-stakes progression matching traditional MMO enchant systems. Item destruction is a known risk. |
| **Materials consumed on failure** | Keeps city economies active; prevents trivial max-level grinding. |
| **Two separate stat pools** | Armor stats (sustain, cooking, EXP) and tool stats (yields, speeds, forge) stay thematically appropriate. |
| **Config registry pattern** | All city-specific data lives in one place; service/controller/UI are fully generic. |
| **`getCityEnchantConfigForSlot()` helper** | Service never hard-codes city names — always resolves from item slot. |
| **Special stats per-item, not per-slot** | Stats travel with the item so market listings retain full enchant value. |
| **Single `EnchantModal` component** | `uiTheme` config drives colors, icons, labels — one component serves all cities. |
