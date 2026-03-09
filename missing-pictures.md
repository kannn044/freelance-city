# Missing Pictures — Freelance City

This document lists all PNG image files that are **referenced in the game code / master data but do NOT yet exist** on disk.  
Download / create the PNG for each row and place it at the path shown.

---

## ✅ Already Exist (for reference)

All images imported in `client/src/lib/itemVisual.tsx` and `TopNavBar / DashboardPage` are present. No action needed for these.

---

## ❌ Missing PNGs (need to download & place)

### 🎫 Permits

| Item Name | File Name | Save Path |
|-----------|-----------|-----------|
| Voltara Drill Permit | `drill_permit.png` | `client/src/assets/items/permits/drill_permit.png` |

---

### 🌱 Seeds

| Item Name | File Name | Save Path |
|-----------|-----------|-----------|
| Fiber Seed | `fiber_seed.png` | `client/src/assets/items/seeds/fiber_seed.png` |

---

### 🪨 Raw Materials

| Item Name | File Name | Save Path |
|-----------|-----------|-----------|
| Fiber Thread | `fiber_thread.png` | `client/src/assets/items/raw/fiber_thread.png` |

---

### ⚗️ Ingredients / Enchantment Materials

| Item Name | File Name | Save Path |
|-----------|-----------|-----------|
| Enchant Stone | `enchant_stone.png` | `client/src/assets/items/ingredients/enchant_stone.png` |
| Rune Shard | `rune_shard.png` | `client/src/assets/items/ingredients/rune_shard.png` |
| Arcane Crystal | `arcane_crystal.png` | `client/src/assets/items/ingredients/arcane_crystal.png` |
| Metal Dust | `metal_dust.png` | `client/src/assets/items/ingredients/metal_dust.png` |
| Rune Ingot | `rune_ingot.png` | `client/src/assets/items/ingredients/rune_ingot.png` |
| Chaos Core | `chaos_core.png` | `client/src/assets/items/ingredients/chaos_core.png` |

---

## ⚠️ Items Using Emoji Fallback (no PNG yet — optional upgrade)

These Textilis & Textilis-equipment items currently display an emoji in-game.  
If you want pixel / illustrated icons for them, add PNGs at the paths below and wire them up in `itemVisual.tsx`.

### Textilis Seeds / Raw / Ingredients

| Item Name | Emoji | Suggested File Name | Suggested Path |
|-----------|-------|---------------------|----------------|
| Cotton Seed | 🌱 | `cotton_seed.png` | `client/src/assets/items/seeds/cotton_seed.png` |
| Sheep Fleece Pouch | 🐑 | `sheep_fleece_pouch.png` | `client/src/assets/items/seeds/sheep_fleece_pouch.png` |
| Raw Cotton | 🌾 | `raw_cotton.png` | `client/src/assets/items/raw/raw_cotton.png` |
| Sheep Wool | 🧶 | `sheep_wool.png` | `client/src/assets/items/raw/sheep_wool.png` |
| Cotton Thread | 🪡 | `cotton_thread.png` | `client/src/assets/items/ingredients/cotton_thread.png` |
| Wool Thread | 🧵 | `wool_thread.png` | `client/src/assets/items/ingredients/wool_thread.png` |
| Loom | 🔩 | `loom.png` | `client/src/assets/items/equipment/weaver/loom.png` |
| Sewing Kit | 🧰 | `sewing_kit.png` | `client/src/assets/items/equipment/tailor/sewing_kit.png` |

### Textilis Equipment

| Item Name | Emoji | Suggested File Name | Suggested Path |
|-----------|-------|---------------------|----------------|
| Fiber Hood | 🎓 | `fiber_hood.png` | `client/src/assets/items/equipment/tailor/fiber_hood.png` |
| Woven Vest | 🦺 | `woven_vest.png` | `client/src/assets/items/equipment/tailor/woven_vest.png` |
| Wool Coat | 🧥 | `wool_coat.png` | `client/src/assets/items/equipment/tailor/wool_coat.png` |
| Cargo Shorts | 👖 | `cargo_shorts.png` | `client/src/assets/items/equipment/tailor/cargo_shorts.png` |
| Linen Backpack | 🎒 | `linen_backpack.png` | `client/src/assets/items/equipment/tailor/linen_backpack.png` |
| Wool Mittens | 🧤 | `wool_mittens.png` | `client/src/assets/items/equipment/tailor/wool_mittens.png` |
| Canvas Shoes | 👟 | `canvas_shoes.png` | `client/src/assets/items/equipment/tailor/canvas_shoes.png` |

---

## 📁 Complete Existing Assets (all present ✅)

### Background
| File | Path |
|------|------|
| `bg.png` | `client/src/assets/bg/bg.png` |

### UI Icons
| File | Path |
|------|------|
| `icon_city_status.png` | `client/src/assets/items/ui/icon_city_status.png` |
| `icon_active_orders.png` | `client/src/assets/items/ui/icon_active_orders.png` |
| `icon_inventory.png` | `client/src/assets/items/ui/icon_inventory.png` |

### Seeds ✅
`chicken_egg.png` · `beef_calf.png` · `vegetable_seed.png` · `crude_oil_barrel.png` · `natural_gas_canister.png` · `crystal_geode.png` · `herb_seed.png` · `mushroom_spore.png` · `mineral_sample.png`

### Raw Materials ✅
`chicken_meat.png` · `beef_meat.png` · `vegetable.png` · `iron_ore.png` · `copper_ore.png` · `steel_ore.png` · `stone.png` · `gem.png` · `gas.png` · `crude_oil.png` · `raw_gas.png` · `power_crystal.png` · `scrap_metal.png` · `medicinal_herb.png` · `luminous_mushroom.png` · `chemical_ore.png` · `pollen.png`

### Ingredients ✅
`salt.png` · `coal.png` · `flux.png` · `oil.png` · `iron_ingot.png` · `copper_ingot.png` · `steel_ingot.png` · `fuel_cell.png` · `coolant.png` · `fertilizer.png` · `catalyst.png` · `distilled_water.png` · `sulfur.png`

### Meals ✅
`chicken_salad.png` · `beef_steak.png` · `beef_stew.png` · `chicken_stew.png` · `healing_potion.png` · `growth_elixir.png` · `smelters_tonic.png` · `mana_elixir.png`

### Permits ✅
`mining_permit.png`

### Equipment — Provider ✅
`sun_hat.png` · `field_shirt.png` · `cargo_pants.png` · `sweatband.png` · `work_gloves.png` · `mud_boots.png` · `fork.png`

### Equipment — Chef ✅
`toque_blanche.png` · `apron.png` · `slack_pants.png` · `wrist_support.png` · `latex_gloves.png` · `anti_slip_shoes.png` · `spatula.png`

### Equipment — Miner ✅
`mattock.png`

### Equipment — Blacksmith ✅
`hammer.png`

### Equipment — Engineer ✅
`wrench.png`

### Equipment — Technician ✅
`soldering_iron.png`

### Equipment — Agraria ✅
`sickle.png`

### Equipment — Medico ✅
`mortar_pestle.png`

---

## 🔧 After Downloading

Once you place the missing PNGs, you must also register them in `client/src/lib/itemVisual.tsx`:

```ts
// Example — add to the correct section

// Seeds
import voltaraDrillPermitPng from '../assets/items/permits/drill_permit.png';
import fiberSeedPng from '../assets/items/seeds/fiber_seed.png';

// Raw
import fiberThreadPng from '../assets/items/raw/fiber_thread.png';

// Ingredients (enchantment)
import enchantStonePng from '../assets/items/ingredients/enchant_stone.png';
import runeShardPng from '../assets/items/ingredients/rune_shard.png';
import arcaneCrystalPng from '../assets/items/ingredients/arcane_crystal.png';
import metalDustPng from '../assets/items/ingredients/metal_dust.png';
import runeIngotPng from '../assets/items/ingredients/rune_ingot.png';
import chaosCoreAng from '../assets/items/ingredients/chaos_core.png';
```

Then add the entries to the corresponding `*ImageByName` maps (e.g. `seedImageByName`, `rawImageByName`, `ingredientImageByName`).
