# Freelance City — Godot Desktop Implementation Plan

> เอกสารนี้วิเคราะห์จากโค้ดต้นฉบับทั้งหมด (Web-based React + Express + Prisma/MySQL)
> เพื่อใช้เป็น blueprint สำหรับ reimplementation ใน Godot 4.x → build เป็น .exe/.dmg สำหรับ Steam

---

## สารบัญ

1. [ภาพรวมเกม (Game Overview)](#1-ภาพรวมเกม)
2. [สถาปัตยกรรม (Architecture)](#2-สถาปัตยกรรม)
3. [ระบบ Authentication & User](#3-ระบบ-authentication--user)
4. [ระบบเมือง (City System)](#4-ระบบเมือง)
5. [ระบบอาชีพ (Occupation System)](#5-ระบบอาชีพ)
6. [ระบบ Workspace & การทำงาน](#6-ระบบ-workspace--การทำงาน)
7. [ระบบ Inventory & Equipment](#7-ระบบ-inventory--equipment)
8. [ระบบความหิว (Hunger/Energy System)](#8-ระบบความหิว)
9. [ระบบ Enchantment](#9-ระบบ-enchantment)
10. [ระบบ Equipment Rarity & Effects](#10-ระบบ-equipment-rarity--effects)
11. [ระบบ Durability](#11-ระบบ-durability)
12. [ระบบ Skill Tree](#12-ระบบ-skill-tree)
13. [ระบบ Market & Trading](#13-ระบบ-market--trading)
14. [ระบบ NPC Shop & Equipment Box (Gacha)](#14-ระบบ-npc-shop--equipment-box-gacha)
15. [ระบบ Recipe & Crafting](#15-ระบบ-recipe--crafting)
16. [ระบบ Daily Quest](#16-ระบบ-daily-quest)
17. [ระบบ Cargo & Shipment](#17-ระบบ-cargo--shipment)
18. [ระบบ Ship & World Map](#18-ระบบ-ship--world-map)
19. [ระบบ Pirate Attack (PvP)](#19-ระบบ-pirate-attack-pvp)
20. [ระบบ Port & Claim](#20-ระบบ-port--claim)
21. [ระบบ City Governance & Election](#21-ระบบ-city-governance--election)
22. [ระบบ Notification](#22-ระบบ-notification)
23. [ระบบ Market Bot (NPC Automation)](#23-ระบบ-market-bot-npc-automation)
24. [ระบบ Level & EXP](#24-ระบบ-level--exp)
25. [ระบบ i18n (Localization)](#25-ระบบ-i18n-localization)
26. [Item Catalog (Master Data)](#26-item-catalog-master-data)
27. [Visual & Animation spec สำหรับ Godot](#27-visual--animation-spec-สำหรับ-godot)
28. [Godot Scene Structure](#28-godot-scene-structure)
29. [Database Schema (SQLite for Desktop)](#29-database-schema-sqlite-for-desktop)
30. [API → Local Service Layer Mapping](#30-api-→-local-service-layer-mapping)

---

## 1. ภาพรวมเกม

**Freelance City** เป็นเกม Economy/Trading Simulation ที่ผู้เล่นเลือกอยู่ใน 1 ใน 5 เมือง แต่ละเมืองมีอาชีพเฉพาะ 2 อาชีพ (Primary + Secondary) ผู้เล่นทำงานผลิตสินค้า, ค้าขายกับผู้เล่นอื่นผ่านตลาด, ส่งสินค้าข้ามเมืองด้วยเรือ, สวมใส่อุปกรณ์, เสริมดวง (enchant), ทำเควสประจำวัน และมีระบบโจรสลัด PvP

### Core Loop
```
เลือกเมือง → เลือกอาชีพ → ทำงาน (farm/mine/craft) → ได้วัตถุดิบ
→ ขายในตลาด / ใช้ทำอาหาร / แปรรูป → ได้เงิน + EXP
→ ซื้ออุปกรณ์ / enchant / อัพสกิล → ทำงานได้เร็ว/ดีขึ้น
→ ค้าขายข้ามเมือง (cargo + ship) → กำไรมากขึ้น
→ ทำเควสประจำวัน → รับรางวัล
→ โจรสลัดปล้นเรือ (PvP RPS) → ได้ของจากเรือคนอื่น
```

---

## 2. สถาปัตยกรรม

### Web Version (ปัจจุบัน)
```
Client (React/Vite) ←HTTP→ Server (Express) ←Prisma→ MySQL
```

### Godot Desktop Version (ใหม่)
```
Godot 4.x Client ←HTTP→ Same Express Server ←Prisma→ MySQL
              OR
Godot 4.x Client ←SQLite local→ เล่นออฟไลน์ (single-player mode)
              OR  
Godot 4.x Client ←WebSocket→ Multiplayer Server (สำหรับ Steam online)
```

**แนะนำ**: สำหรับ Steam release ให้ใช้ Dedicated Server + WebSocket สำหรับ multiplayer เพราะต้อง anti-cheat

### Godot Project Structure
```
res://
├── project.godot
├── autoload/
│   ├── GameManager.gd          # Global state (เทียบ Zustand stores)
│   ├── AuthManager.gd          # Login/token/user state
│   ├── NetworkManager.gd       # HTTP/WebSocket communication
│   └── LocaleManager.gd        # i18n
├── scenes/
│   ├── login/
│   │   └── LoginScene.tscn
│   ├── city_selection/
│   │   └── CitySelectionScene.tscn
│   ├── dashboard/
│   │   ├── DashboardScene.tscn
│   │   ├── InventoryPanel.tscn
│   │   ├── WorkspacePanel.tscn
│   │   ├── HungerBar.tscn
│   │   └── active_orders/
│   │       ├── AgrariaOrders.tscn
│   │       ├── FerrumOrders.tscn
│   │       ├── VoltaraOrders.tscn
│   │       ├── TextilisOrders.tscn
│   │       └── MedicoOrders.tscn
│   ├── marketplace/
│   │   └── MarketplaceScene.tscn
│   ├── quest/
│   │   └── QuestScene.tscn
│   ├── cargo/
│   │   └── CargoScene.tscn
│   ├── world_map/
│   │   └── WorldMapScene.tscn
│   ├── port/
│   │   └── PortScene.tscn
│   └── ui/
│       ├── TopNavBar.tscn
│       ├── ConfirmDialog.tscn
│       ├── EnchantModal.tscn
│       ├── RepairModal.tscn
│       ├── NotificationCenter.tscn
│       ├── SkillTreeModal.tscn
│       └── ToastNotification.tscn
├── resources/
│   ├── items/                  # Item sprites (PNG)
│   ├── backgrounds/            # City backgrounds
│   ├── ui/                     # UI themes
│   ├── fonts/                  # Thai + English fonts
│   ├── audio/                  # SFX + BGM
│   └── data/
│       ├── master_data.json    # Item/recipe catalog
│       ├── map_data.json       # City coordinates + routes
│       └── locale/
│           ├── en.json
│           └── th.json
├── scripts/
│   ├── services/               # Business logic (เทียบ server services)
│   │   ├── CityService.gd
│   │   ├── HungerService.gd
│   │   ├── DurabilityService.gd
│   │   ├── EnchantmentService.gd
│   │   ├── EquipmentEffectsService.gd
│   │   ├── LevelService.gd
│   │   ├── MarketBotService.gd
│   │   ├── QuestService.gd
│   │   ├── ShipmentService.gd
│   │   └── WorkspaceRulesService.gd
│   └── data/
│       ├── GameConfig.gd       # All constants
│       └── ItemDB.gd           # Item lookup
└── shaders/
    ├── glow.gdshader
    ├── enchant_sparkle.gdshader
    └── ocean_wave.gdshader
```

---

## 3. ระบบ Authentication & User

### User Data Model
```
User {
  id: int (auto-increment)
  email: string (unique)
  password_hash: string
  role: "CITIZEN" | "MAYOR"
  money: int (default: 5000)
  hunger: float (default: 2400)
  hunger_updated_at: datetime
  satiety_buff: float (default: 0)         # อัตราลดความหิว (0-0.9)
  buff_expires_at: datetime?
  city_key: string?                         # AGRARIA/FERRUM/VOLTARA/TEXTILIS/MEDICO
  city_selected_at: datetime?
  first_job_level: int (default: 0)         # 0 = ยังไม่ unlock, 1+ = active
  first_job_skill_level: int (default: 0)
  first_job_exp: int (default: 0)
  secondary_job_level: int (default: 0)
  secondary_job_skill_level: int (default: 0)
  secondary_job_exp: int (default: 0)
  locked_money: int (default: 0)            # เงินค้ำ purchase order
  created_at: datetime
  updated_at: datetime
}
```

### Authentication Flow
1. **Register**: email + password (min 6 chars) → สร้าง user + 16 inventory slots → return JWT token
2. **Login**: email + password → verify → sync hunger → return JWT token + user data
3. **Token**: JWT with `{ userId }` payload, ส่งใน header `Authorization: Bearer <token>`
4. **Session**: เก็บ token ใน sessionStorage (web) / ไฟล์ local (Godot)

### User Flow
```
Register/Login → Select City (ครั้งแรกฟรี) → Select Primary Job → Play
                                                                    ↓
                                          Level 5 → Unlock Secondary Job
```

---

## 4. ระบบเมือง

### เมืองทั้งหมด 5 เมือง

| City Key | ชื่อ | สีประจำ | ประเภท | อาชีพหลัก | อาชีพรอง |
|---|---|---|---|---|---|
| `AGRARIA` | Agraria | `#4ade80` (เขียว) | Food & Agriculture | Farmer (FARM) | Chef (COOK) |
| `FERRUM` | Ferrum | `#94a3b8` (เทา) | Industry & Tools | Miner (MINE) | Blacksmith (SMELT) |
| `VOLTARA` | Voltara | `#facc15` (เหลือง) | Energy & Fuel | Technician (EXTRACT) | Engineer (REFINE) |
| `TEXTILIS` | Textilis | `#c084fc` (ม่วง) | Textiles & Fashion | Weaver (GATHER) | Tailor (SEW) |
| `MEDICO` | Medico | `#38bdf8` (ฟ้า) | Science & Alchemy | Gatherer (FORAGE) | Alchemist (BREW) |

### City Location บน World Map (SVG 1400×700)

| City | X | Y |
|---|---|---|
| AGRARIA | 200 | 300 |
| TEXTILIS | 360 | 540 |
| FERRUM | 640 | 150 |
| VOLTARA | 920 | 290 |
| MEDICO | 1160 | 490 |

### ระบบ City Tier
เมืองมี treasury (คลัง) ที่เก็บภาษีจากการค้า → เมื่อ treasury ถึง threshold จะ tier up

**Tier Thresholds:**

| Tier | Treasury ขั้นต่ำ |
|---|---|
| 1 | 0 |
| 2 | 300,000 |
| 3 | 1,500,000 |
| 4 | 7,000,000 |
| 5 | 25,000,000 |
| 6 | 75,000,000 |
| 7 | 180,000,000 |
| 8 | 400,000,000 |
| 9 | 750,000,000 |
| 10 | 1,100,000,000 |

**Tier Bonuses (per tier rank 0-9):**

| Bonus | ต่อ tier rank | สูงสุด (Tier 10) |
|---|---|---|
| Task time reduction | 1% | 9% |
| NPC shop discount | 0.5% | 4.5% |
| Market fee discount | 0.75% | 6.75% |
| Rare drop bonus | 0.3% | 2.7% |

### ภาษีการค้า (Tax System)
- **Domestic Tax**: ซื้อขายในเมืองเดียวกัน (default 3%, range 0-12%, step 0.5%)
- **Export Tax**: ผู้ขายจ่ายเมื่อส่งออก (default 3%)
- **Import Tax**: ผู้ซื้อจ่ายเมื่อนำเข้า (default 3%)
- **Treasury receives**: 70% ของภาษีรวม
- Mayor สามารถปรับอัตราภาษีได้

### การย้ายเมือง
- ครั้งแรก: ฟรี
- ย้ายเมือง: ค่าใช้จ่าย **1,000,000 credits**, จำกัด 1 ครั้ง/election cycle (7 วัน)
- **Reset ทั้งหมด**: job level → 1, EXP → 0, skills → 0

---

## 5. ระบบอาชีพ

### โครงสร้างอาชีพ
ผู้เล่นแต่ละคนมี 2 slot:
- **First Job** (Primary): เลือกตอนเริ่มเกม
- **Secondary Job**: ปลดล็อคเมื่อ first job ถึง level 5

### อาชีพแต่ละเมือง

| เมือง | First Job | Work Type | Tool ที่ต้องใส่ | Secondary Job | Work Type | Tool ที่ต้องใส่ |
|---|---|---|---|---|---|---|
| Agraria | Farmer | FARM | Fork | Chef | COOK | Spatula |
| Ferrum | Miner | MINE | Mattock | Blacksmith | SMELT | Hammer |
| Voltara | Technician | EXTRACT | Wrench | Engineer | REFINE | Soldering Iron |
| Textilis | Weaver | GATHER | Loom | Tailor | SEW | Sewing Kit |
| Medico | Gatherer | FORAGE | Sickle | Alchemist | BREW | Mortar & Pestle |

### Permit System (เฉพาะเมือง)
- **Ferrum**: ต้องมี "Ferrum Mining Permit" (ได้จากระบบ)
- **Voltara**: ต้องมี "Voltara Drill Permit" (ได้จากระบบ)

---

## 6. ระบบ Workspace & การทำงาน

### 6.1 First Job Workspaces (ผลิตวัตถุดิบ)

#### Agraria — Farming (Plot 3×3 = 9 ช่อง)
```
[Chicken Egg] [Chicken Egg] [Vegetable Seed]
[Beef Calf  ] [           ] [              ]
[           ] [           ] [              ]
```
- เลือก seed จาก inventory → วางลงช่อง → เริ่มนับเวลา grow_mins
- เมื่อ plot เต็ม 9 ช่อง → **ได้โบนัส -10% เวลา** (average timers ของทุก order แล้วลด 10%)
- max plots ควบคุมโดย skill branch level (1-3 plots = 9-27 ช่อง)
- seed แต่ละชนิดมี grow time ต่างกัน

**Agraria Seeds:**

| Seed | ราคาซื้อ | Grow Time | ผลลัพธ์ | จำนวน |
|---|---|---|---|---|
| Chicken Egg | 50 | 10 min | Chicken Meat | 1 |
| Beef Calf | 120 | 20 min | Beef Meat | 1 |
| Vegetable Seed | 30 | 8 min | Vegetable | 2 |

#### Ferrum — Mining (3 layers × 3 slots)
```
🔵 SURFACE: [Slot 1] [Slot 2] [Slot 3]    ← 6 min per expedition
🟡 DEEP:    [Slot 1] [Slot 2] [Slot 3]    ← 11 min per expedition
🔴 CORE:    [Slot 1] [Slot 2] [Slot 3]    ← 16 min per expedition
```
- ไม่ต้องเลือก seed — เลือก layer เท่านั้น
- แต่ละ layer มี drop rate ต่างกัน
- DEEP/CORE ไม่มี Safety Helmet → **hunger decay ×2**
- เมื่อ layer เต็ม 3/3 → **-10% เวลาโบนัส**

**Ferrum Drop Rates:**

| Layer | Iron | Copper | Steel | Stone | Coal | Gem |
|---|---|---|---|---|---|---|
| Surface | 65% | 30% | 0% | 70% | 45% | 2% |
| Deep | 45% | 45% | 18% | 55% | 60% | 5% |
| Core | 30% | 35% | 35% | 45% | 70% | 9% |

#### Voltara — Extraction (Plot 3×3 = 9 ช่อง)
```
เหมือน Agraria แต่ใช้ seeds ของ Voltara:
- Crude Oil Barrel → Crude Oil (10 min, 1 qty)
- Natural Gas Canister → Raw Gas (8 min, 2 qty)
- Crystal Geode → Power Crystal (16 min, 1 qty)
```

#### Textilis — Gathering (Plot 2×3 = 6 ช่อง)
```
- Cotton Seed → Raw Cotton (45 min, 3 qty)
- Sheep Fleece Pouch → Sheep Wool (60 min, 2 qty)
- Fiber Seed → Fiber Thread (8 min, 3 qty)
```

#### Medico — Foraging (Plot 2×3 = 6 ช่อง)
```
- Herb Seed → Medicinal Herb (8 min, 2 qty)
- Mushroom Spore → Luminous Mushroom (12 min, 1 qty)
- Mineral Sample → Chemical Ore (15 min, 1 qty)
```

### 6.2 Secondary Job Workspaces (แปรรูป/ปรุง)

ทุกเมืองใช้ระบบเดียวกัน — เลือก recipe → ใส่วัตถุดิบ → เริ่มทำงาน

#### ระบบ Queue
- มี **lane slots** ควบคุมโดย TIME_QUEUE skill branch
- Level 1-2: 1 lane, Level 3-4: 2 lanes, Level 5: 3 lanes  
- สามารถทำงานพร้อมกันได้ตามจำนวน lane

#### ระบบ Ingredient Selection
- **Auto**: ระบบเลือกวัตถุดิบจาก inventory อัตโนมัติ
- **Manual**: ผู้เล่นเลือก slot + quantity เอง (สำคัญเมื่อ ingredient มี rarity ต่างกัน)

#### Ingredient Save Chance
- **Primary ingredient**: ควบคุมโดย skill branch "CRAFT_COST" [6-30%]
- **Secondary ingredients**: ควบคุมโดย equipment effect `cookSecondaryIngredientSaveChance` [max 90%]
- **Enchant bonus**: `enchantIngredientSaveExtraPct` เพิ่มเติม
- หาก roll สำเร็จ → **คืนวัตถุดิบทั้งหมด** (ไม่ใช่ทีละชิ้น)

#### Cook Rarity Mixing (เฉพาะอาหาร)
เมื่อใช้วัตถุดิบที่มี rarity ต่างกัน → จับคู่ rarity → roll ผลลัพธ์

| Mix | ผลลัพธ์ที่เป็นไปได้ |
|---|---|
| NORMAL + NORMAL | NORMAL 100% |
| NORMAL + RARE | NORMAL 70%, RARE 30% |
| RARE + RARE | NORMAL 50%, RARE 50% |
| RARE + EPIC | NORMAL 35%, RARE 55%, EPIC 10% |
| EPIC + EPIC | NORMAL 25%, RARE 35%, EPIC 40% |
| EPIC + LEGENDARY | NORMAL 20%, RARE 35%, EPIC 45% |
| LEGENDARY + LEGENDARY | NORMAL 10%, RARE 20%, EPIC 35%, LEGENDARY 35% |

### 6.3 Time Modifiers Stack

เวลาทำงานจริง = base time × modifiers ทั้งหมด

```
effectiveTime = baseGrowMins
  × hungerTierMultiplier          # 1.0x / 1.2x / 1.5x / 2.5x
  × firstJobTaskTimeMultiplier    # admin config (default 1.0)
  × (1 - skillTimeReductionPct)   # skill branch TIME_QUEUE [0-25%]
  × (1 - equipFarmTimeReduction)  # equipment effect [max 80%]
  × (1 - enchantWorkSpeedPct)     # enchant special stat
  × (1 - cityTierTaskTimeReduction) # city tier bonus [0-9%]
  × plotFullBonus                 # 0.9 when plot is full
```

### 6.4 Collect Results

เมื่อรวบรวมผลงาน:
- **First job**: ได้ yield item (ตาม seed → yield mapping) พร้อม rarity roll
- **Ferrum mining**: weighted drop จาก drop rate table ของ layer นั้น
- **Secondary job**: ได้ recipe output item
- **Double yield**: โอกาสจาก equipment `farmDoubleYieldChance` + enchant `enchantFirstJobDoubleChancePct`
- **Bonus output**: โอกาสจาก skill branch OUTPUT_BONUS [4-20%] → +1 quantity
- **Gourmet chance**: โอกาสจาก equipment → upgrade rarity ของ output

### 6.5 Cancel Work
- ยกเลิก order ที่ยังไม่ ready → คืนวัตถุดิบ (seed/ingredients)
- revert plot bonus ถ้า order อยู่ใน complete plot
- reschedule queue ที่เหลือ

---

## 7. ระบบ Inventory & Equipment

### Inventory Grid
- **16 slots** (4×4 grid)
- แต่ละ slot เก็บ item ชนิดเดียว + quantity
- **Max stack**: ตาม item's `max_stack` + equipment bonuses

```
InventorySlot {
  slot: 0-15
  item_id: int?
  quantity: int
  equipment_rarity: "NORMAL"|"RARE"|"EPIC"|"LEGENDARY"?
  equipment_durability: float?
  enchant_level: 0-12
  special_stat_1: string?  # milestone +3
  special_stat_2: string?  # milestone +6
  special_stat_3: string?  # milestone +9
  special_stat_4: string?  # milestone +12
}
```

### Equipment Slots (6 slots)

| Slot | ชื่อ | ตัวอย่าง Items |
|---|---|---|
| HEAD | หมวก | Sun Hat, Toque Blanche, Fiber Hood |
| UPPER_BODY | เสื้อ | Field Shirt, Apron, Woven Vest, Wool Coat |
| LOWER_BODY | กางเกง | Cargo Pants, Slack Pants, Cargo Shorts, Linen Backpack |
| ARM | แขน/อาวุธ | Fork, Mattock, Wrench, Loom, Sewing Kit, etc. |
| GLOVE | ถุงมือ | Work Gloves, Latex Gloves, Wool Mittens |
| SHOE | รองเท้า | Mud Boots, Anti-Slip Shoes, Canvas Shoes |

### Equipment Actions
- **Equip**: ลาก/กดจาก inventory → ใส่ slot (swap ถ้ามีของเดิม)
- **Unequip**: ถอดใส่ inventory (ต้องมี slot ว่าง)
- **Eat**: กินอาหารจาก inventory → เติม hunger + buff
- **Discard**: ทิ้งของจาก inventory
- **Organize**: 
  - `combine` — รวม stack ซ้ำเข้าด้วยกัน
  - `sort-az` — เรียง A-Z

### Stack Bonus จาก Equipment
```
effectiveMaxStack = baseMaxStack + rawStackBonus (ถ้า RAW) + ingredientStackBonus (ถ้า INGREDIENT)
```

---

## 8. ระบบความหิว

### ค่าคงที่

| Constant | Value |
|---|---|
| MAX_HUNGER | 2400 kcal |
| GAME_DAY_MINUTES | 180 min (3 ชั่วโมงจริง) |
| HUNGER_DECAY_PER_MIN | ~13.33 kcal/min (passive) |

### Hunger Tiers

| % Hunger | สถานะ | สี | Time Multiplier |
|---|---|---|---|
| 80-100% | Fit | สีเขียว `#22c55e` | 1.0x |
| 40-79% | Normal | สีเหลือง `#eab308` | 1.2x |
| 20-39% | Hungry | สีส้ม `#f97316` | 1.5x |
| 0-19% | Starving | สีแดง `#ef4444` | 2.5x |

### Hunger Decay Formula (ขณะทำงาน)

```gdscript
# First Job Decay (FARM/MINE/EXTRACT/GATHER/FORAGE)
active_plots = ceil(active_orders_count / 9)
first_job_decay = elapsed_sec × active_plots × FARM_PER_PLOT  # 0.01 kcal/sec/plot

# Mining deep/core without Safety Helmet
burn_multiplier = 2.0  # ปกติ 1.0
first_job_decay *= burn_multiplier

# Secondary Job Decay (COOK/SMELT/REFINE/SEW/BREW)  
secondary_job_decay = elapsed_sec × active_menus × COOK_PER_MENU  # 0.25 kcal/sec/menu
secondary_job_decay *= (1 - cook_state_hunger_decay_reduction_pct)  # cap 90%

# Total
total_decay = first_job_decay + secondary_job_decay
total_decay *= (1 - satiety_buff)        # food buff reduction
total_decay *= (1 - enchant_task_hunger_cost_pct)  # cap 90%
total_decay -= hunger_decay_reduction_per_min × elapsed_minutes  # flat equipment reduction
new_hunger = max(0, hunger - total_decay)
```

### Hard Pause at 0 Kcal
เมื่อ hunger = 0 → **ทุก work order ถูก freeze** (shift เวลาไปข้างหน้า)
จนกว่าจะกินอาหารเพิ่ม hunger กลับมา

### การกินอาหาร (Eat)
```
effective_kcal = meal_kcal
effective_buff_pct = min(0.9, meal_buff_pct + equipment_extra_satiety_pct)
effective_buff_mins = meal_buff_mins × (1 + enchant_satiety_buff_duration_pct)
max_hunger = MAX_HUNGER + max_hunger_bonus + enchant_max_hunger_flat
new_hunger = min(max_hunger, current_hunger + effective_kcal)
```

### Rarity Bonus สำหรับอาหาร

| Rarity | Buff Multiplier |
|---|---|
| NORMAL | 1.0x |
| RARE | 1.2x |
| EPIC | 1.5x |
| LEGENDARY | 2.0x |

---

## 9. ระบบ Enchantment

### ภาพรวม
สามารถ enchant อุปกรณ์จาก +0 → +12 โดยใช้วัตถุดิบ + เงิน
- **Textilis** enchant HEAD, UPPER_BODY, LOWER_BODY, GLOVE, SHOE
- **Ferrum** enchant ARM

### อัตราสำเร็จ

| Target Level | Success Rate |
|---|---|
| +1 | 90% |
| +2 | 80% |
| +3 | 50% |
| +4 | 40% |
| +5 | 30% |
| +6 | 10% |
| +7 | 8% |
| +8 | 4% |
| +9 | 1% |
| +10 | 0.5% |
| +11 | 0.01% |
| +12 | 0.005% |

### Enchant Bonus Multiplier (เพิ่ม effect ของ base equipment)

| Level | Multiplier |
|---|---|
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

### Failure Mechanics
- Level 1-9: drop 1 level (floor = 1)
- Level 10-12: drop 2 levels (floor = 1)
- **Destroy Zone**: level ≥ 6 → failure มี **50% โอกาสทำลาย** อุปกรณ์สูญหายถาวร
- failure clears special stats ที่อยู่เหนือ level ใหม่

### Special Stat Milestones
enchant ถึง level 3, 6, 9, 12 จะได้ special stat สุ่ม 1 ตัวจาก pool ของเมือง

**Textilis Pool (12 stats):**

| Stat Key | Effect | Value |
|---|---|---|
| enchant_exp_gain_pct | +EXP | +8% |
| enchant_durability_protect_pct | -Durability Loss | 12% |
| enchant_rare_drop_pct | +Rare Drop | 3% |
| enchant_first_job_qty_bonus | +Harvest Qty | +1 |
| enchant_market_tax_discount_pct | -Market Tax | 2% |
| enchant_task_hunger_cost_pct | -Task Hunger | 8% |
| enchant_max_hunger_flat | +Max Hunger | +150 Kcal |
| enchant_secondary_job_double_chance_pct | +Double Item | 4% |
| enchant_satiety_buff_duration_pct | +Buff Duration | 15% |
| enchant_ingredient_save_extra_pct | +Ingredient Save | 5% |
| enchant_work_speed_pct | +Work Speed | 4% |
| enchant_gourmet_chance_pct | +Gourmet Chance | 3% |

**Ferrum Pool (8 stats):**

| Stat Key | Effect | Value |
|---|---|---|
| enchant_first_job_speed_pct | -Expedition Speed | 10% |
| enchant_first_job_double_chance_pct | +Double Item | 6% |
| enchant_rare_find_pct | +Rare Drop | 4% |
| enchant_secondary_job_speed_pct | -Secondary Job Speed | 8% |
| enchant_secondary_job_bonus_pct | +Double Item | 5% |
| enchant_deep_hunger_reduction_pct | -Deep Task Hunger | 10% |
| enchant_tool_durability_protect_pct | -Tool Durability Loss | 15% |
| enchant_first_job_yield_flat | +Farm Yield | +2 |

### Enchant Materials

**Textilis (SEW workshop):**

| Target Level | Material | Qty | Gold Cost |
|---|---|---|---|
| +1 | Enchant Stone | 3 | 500 |
| +2 | Enchant Stone | 5 | 1,000 |
| +3 | Enchant Stone | 8 | 2,000 |
| +4 | Enchant Stone | 10 | 4,000 |
| +5 | Enchant Stone | 12 | 7,000 |
| +6 | Rune Shard | 5 | 12,000 |
| +7 | Rune Shard | 8 | 18,000 |
| +8 | Rune Shard | 12 | 25,000 |
| +9 | Rune Shard | 15 | 35,000 |
| +10 | Arcane Crystal | 10 | 50,000 |
| +11 | Arcane Crystal | 15 | 70,000 |
| +12 | Arcane Crystal | 30 | 90,000 |

**Ferrum (SMELT workshop):** ใช้ Metal Dust / Rune Ingot / Chaos Core ด้วย cost table เดียวกัน

### Enchant Level Color Coding

| Level | สี |
|---|---|
| 0 | สีเทา 30% |
| 1-2 | Lime `#a3e635` |
| 3 | Emerald `#34d399` |
| 4-5 | Sky `#38bdf8` |
| 6 | Indigo `#818cf8` |
| 7-8 | Violet `#a78bfa` |
| 9 | Pink `#f472b6` |
| 10-11 | Orange `#fb923c` |
| 12 | Gold `#facc15` |

---

## 10. ระบบ Equipment Rarity & Effects

### Equipment Rarity Tiers

| Rarity | สี | Effect Multiplier |
|---|---|---|
| NORMAL | สีเทา rgba(255,255,255,0.6) | 0.25x |
| RARE | สีฟ้า `#60a5fa` | 0.50x |
| EPIC | สีม่วง `#a78bfa` | 0.75x |
| LEGENDARY | สีทอง `#facc15` | 1.00x |

### Effect Value Calculation
```
effective_effect = base_effect_value × rarity_multiplier × (1 + enchant_bonus_multiplier)
```
ตัวอย่าง: Fork (farm_time_reduction_pct) effect_value=0.1
- NORMAL +0: 0.1 × 0.25 × 1.0 = 0.025 (2.5%)
- LEGENDARY +12: 0.1 × 1.0 × 2.5 = 0.25 (25%)

### Equipment Effects ทั้งหมด

| Effect Key | คำอธิบาย | Cap |
|---|---|---|
| `hunger_penalty_tier_reduction` | ลด hunger tier penalty | - |
| `cook_secondary_ingredient_save_chance` | โอกาสประหยัดวัตถุดิบรอง | 90% |
| `max_hunger_bonus` | +Kcal max hunger | - |
| `max_hunger_and_satiety_bonus` | +max hunger + satiety buff % | - |
| `raw_stack_bonus` | +RAW item stack size | - |
| `ingredient_stack_bonus` | +INGREDIENT item stack size | - |
| `farm_time_reduction_pct` | ลดเวลา farm | 80% |
| `cook_time_reduction_pct` | ลดเวลา cook | 80% |
| `farm_double_yield_chance` | โอกาสได้ผลผลิต 2 เท่า | 90% |
| `gourmet_chance` | โอกาส upgrade rarity output | 90% |
| `hunger_decay_reduction_per_min` | ลด hunger drain ต่อนาที | - |
| `cook_state_hunger_decay_reduction_pct` | ลด hunger drain ขณะ cook | 90% |

### Harvest Item Rarity Drop (weighted roll)

| Rarity | Weight |
|---|---|
| NORMAL | 80 |
| RARE | 28 |
| EPIC | 1.9 |
| LEGENDARY | 0.1 |

### Equipment Box Rarity Drop (probability roll)

| Rarity | Chance |
|---|---|
| NORMAL | 95% |
| RARE | 4.5% |
| EPIC | 0.45% |
| LEGENDARY | 0.05% |

---

## 11. ระบบ Durability

### ค่าคงที่
- **MAX_DURABILITY**: 100
- Equipment ที่ durability ≤ 0 = **broken** → effects ไม่ทำงาน → บล็อกเริ่มงาน

### Durability Decay Rate (per second ขณะทำงาน)

| Work Type | Rate/sec |
|---|---|
| FARM, EXTRACT, GATHER, FORAGE | 0.005 - 0.01 |
| MINE | 0.01 |
| COOK, SMELT, REFINE, SEW, BREW | 0.015 |

### Decay Formula
```
decay = Σ(overlap_seconds_per_order × decay_rate_for_work_type)
protected_decay = decay × (1 - enchant_durability_protect_pct - enchant_tool_durability_protect_pct)
# combined protection cap: 90%
new_durability = max(0, current_durability - protected_decay)
```

### ซ่อม Equipment (Repair)
- ใช้วัตถุดิบจาก **crafting recipe ของ item นั้น** (ต้องมี recipe)
- จำนวนวัตถุดิบ proportional กับ % ที่เสีย
- ซ่อมแล้วกลับเป็น MAX_DURABILITY (100)

### Workspace Pause System
- ถ้า equipment ที่ required สำหรับ work type นั้น **broken**  → pause all active work orders
- เมื่อซ่อมเสร็จ → unpause (shift เวลาไปข้างหน้าตามเวลาที่ pause)

---

## 12. ระบบ Skill Tree

### โครงสร้าง
แต่ละอาชีพ (10 อาชีพ) มี 3 branches เหมือนกัน แต่ prefix ต่างกัน

### Skill Branches (per occupation, max level 5)

#### Branch 1: Workflow Mastery (TIME_QUEUE)
- ลดเวลาทำงาน + เพิ่ม queue slots

| Level | Time Reduction | Queue Limit |
|---|---|---|
| 1 | 5% | 1 |
| 2 | 10% | 1 |
| 3 | 15% | 2 |
| 4 | 20% | 2 |
| 5 | 25% | 3 |

#### Branch 2: Resource Efficiency (CRAFT_COST)
- โอกาสประหยัดวัตถุดิบทั้งหมด

| Level | Save All Chance |
|---|---|
| 1 | 6% |
| 2 | 12% |
| 3 | 18% |
| 4 | 24% |
| 5 | 30% |

#### Branch 3: Output Mastery (OUTPUT_BONUS)
- โอกาสได้ output เพิ่ม +1

| Level | Bonus Chance |
|---|---|
| 1 | 4% |
| 2 | 8% |
| 3 | 12% |
| 4 | 16% |
| 5 | 20% |

### Skill Points
- ได้ 1 skill point ต่อ 1 occupation level
- ใช้ point อัพ branch ใดก็ได้ (ไม่เกิน max level 5)
- **Immediate effect**: อัพ TIME_QUEUE → ลดเวลา work orders ที่กำลังทำอยู่ทันที

---

## 13. ระบบ Market & Trading

### Market Listings
```
MarketListing {
  seller_id: int
  buyer_id: int?
  item_id: int
  quantity: int
  price: int              # ราคารวม
  equipment_rarity: string?
  status: "ACTIVE" | "SOLD" | "CANCELLED"
  enchant_level: int
  special_stat_1-4: string?
  
  # Cross-city fields
  cargo_box_id: int?
  is_cross_city: bool
  origin_city: string?
}
```

### การซื้อขาย

#### Sell (สร้าง listing)
1. เลือก item จาก inventory
2. ตั้งจำนวน + ราคา (ต่อหน่วย × จำนวน = ราคารวม)
3. item ถูกหักจาก inventory → สร้าง listing

#### Buy (ซื้อ listing)
1. เลือก listing
2. รองรับ **partial buy** (ซื้อบางส่วน)
3. คำนวณภาษี:
   - **Same city**: domestic tax
   - **Cross city**: export tax (seller) + import tax (buyer)
4. หักเงิน buyer, เครดิต seller (ลบภาษี)
5. Award EXP ให้ seller

#### Cancel
- ยกเลิก listing ของตัวเอง → คืน item กลับ inventory

### Tax Calculation
```
# Same city
domestic_tax = floor(price × domestic_tax_bp / 10000)
seller_receives = price - domestic_tax
buyer_pays = price + 0  # buyer ไม่จ่ายภาษีเพิ่ม (เฉพาะ domestic)

# Cross city
export_tax = floor(price × export_tax_bp / 10000)
import_tax = floor(price × import_tax_bp / 10000)
seller_receives = price - export_tax
buyer_pays = price + import_tax
```

### Seller Tax Discount (enchant)
```
enchant_discount = min(0.5, seller_enchant_market_tax_discount_pct)
actual_seller_tax = floor(gross_tax × (1 - enchant_discount))
```

### Sales History
- เก็บ 100 รายการล่าสุดที่ SOLD

### Listings Cache
- Server cache listings 5 วินาที
- Client auto-refresh ทุก 30 วินาที

---

## 14. ระบบ NPC Shop & Equipment Box (Gacha)

### NPC Shop
- แต่ละเมืองขายของต่างกัน (ตาม `city_shop_item_rules` + `city_shop_recipe_rules`)
- ราคา = `base_buy_price × npc_shop_multiplier`
- City tier discount ลดราคา

**Agraria Shop:** Chicken Egg, Beef Calf, Vegetable Seed, Salt, Fork, Spatula
**Ferrum Shop:** Mattock, Hammer
**Voltara Shop:** Crude Oil Barrel, Natural Gas Canister, Crystal Geode, Coolant, Wrench, Soldering Iron
**Textilis Shop:** Cotton Seed, Sheep Fleece Pouch, Cotton Thread, Wool Thread, Loom, Sewing Kit, Fiber Seed
**Medico Shop:** Herb Seed, Mushroom Spore, Mineral Sample, Distilled Water, Sulfur, Sickle, Mortar & Pestle

### Sell to NPC
- ขายที่ราคา `sell_price` ของ item (ถ้า null = ขายไม่ได้)

### Equipment Box (Gacha)
- **ราคา**: 420 credits (configurable)
- **Roll Process**:
  1. Roll equipment slot (weighted):
     - HEAD: 14, UPPER_BODY: 18, LOWER_BODY: 18, ARM: 16, GLOVE: 16, SHOE: 18
  2. Roll random item ใน slot นั้น
  3. Roll rarity: NORMAL 95% / RARE 4.5% / EPIC 0.45% / LEGENDARY 0.05%
- ได้ item ใส่ inventory

---

## 15. ระบบ Recipe & Crafting

### Recipe Structure
```
Recipe {
  name: string
  output_item_id: int
  output_qty: int
  cook_mins: int          # เวลาทำ (จริง minutes)
  unlock_price: int       # ราคาปลดล็อค
  ingredients: [
    { item_id, quantity }
  ]
}
```

### Recipe ทั้งหมด

#### Agraria Recipes (COOK)

| Recipe | Output | Time | Unlock | Ingredients |
|---|---|---|---|---|
| Chicken Salad | Chicken Salad ×1 | 5 min | 250 | Chicken Meat ×2, Vegetable ×3, Salt ×1, Gas ×1 |
| Beef Steak | Beef Steak ×1 | 10 min | 600 | Beef Meat ×2, Vegetable ×2, Salt ×1, Gas ×1 |
| Beef Stew | Beef Stew ×1 | 12 min | 650 | Beef Meat ×2, Vegetable ×3, Salt ×1, Gas ×1 |
| Chicken Stew | Chicken Stew ×1 | 12 min | 550 | Chicken Meat ×2, Vegetable ×3, Salt ×1, Gas ×1 |

#### Ferrum Recipes (SMELT)

| Recipe | Output | Time | Unlock | Ingredients |
|---|---|---|---|---|
| Iron Ingot Smelt | Iron Ingot ×1 | 7 min | 450 | Iron Ore ×2, Flux ×1, Coal ×2, Oil ×1 |
| Copper Ingot Smelt | Copper Ingot ×1 | 8 min | 350 | Copper Ore ×2, Flux ×1, Coal ×2, Oil ×1 |
| Steel Ingot Smelt | Steel Ingot ×1 | 10 min | 550 | Steel Ore ×2, Flux ×1, Coal ×2, Oil ×1 |
| Extract stone | Stone ×1 | 6 min | 500 | Stone ×20 |
| Fork Crafting | Fork ×1 | 12 min | 500 | Iron Ingot ×3, Coal ×1, Steel Ore ×2 |
| Mattock Crafting | Mattock ×1 | 12 min | 500 | Iron Ingot ×2, Coal ×1, Steel Ore ×3 |
| Hammer Crafting | Hammer ×1 | 12 min | 500 | Iron Ingot ×3, Coal ×1, Steel Ore ×2 |
| Spatula Crafting | Spatula ×1 | 12 min | 500 | Iron Ingot ×2, Coal ×1, Steel Ore ×3 |
| Wrench Crafting | Wrench ×1 | 12 min | 500 | Iron Ingot ×2, Coal ×1, Steel Ore ×3 |
| Soldering Iron Crafting | Soldering Iron ×1 | 12 min | 500 | Iron Ingot ×3, Coal ×1, Steel Ore ×2 |
| Sickle Crafting | Sickle ×1 | 12 min | 500 | Iron Ingot ×2, Coal ×1, Steel Ore ×3 |
| Mortar Crafting | Mortar & Pestle ×1 | 12 min | 500 | Iron Ingot ×3, Coal ×1, Steel Ore ×2 |
| Craft Metal Dust | Metal Dust ×1 | 5 min | 300 | Iron Ore ×3, Coal ×1 |
| Craft Rune Ingot | Rune Ingot ×1 | 15 min | 800 | Metal Dust ×2, Steel Ore ×1, Flux ×1 |
| Craft Chaos Core | Chaos Core ×1 | 40 min | 2000 | Rune Ingot ×2, Steel Ingot ×1, Oil ×1 |

#### Voltara Recipes (REFINE)

| Recipe | Output | Time | Unlock | Ingredients |
|---|---|---|---|---|
| Gas Distillation | Gas ×1 | 7 min | 400 | Raw Gas ×3, Coolant ×1 |
| Oil Refining | Oil ×1 | 8 min | 450 | Crude Oil ×2, Coal ×1, Coolant ×1 |
| Fuel Cell Assembly | Fuel Cell ×1 | 12 min | 600 | Power Crystal ×1, Crude Oil ×2, Coolant ×1 |

#### Medico Recipes (BREW)

| Recipe | Output | Time | Unlock | Ingredients |
|---|---|---|---|---|
| Flux Synthesis | Flux ×1 | 7 min | 400 | Chemical Ore ×1, Pollen ×2, Distilled Water ×1 |
| Fertilizer Brew | Fertilizer ×1 | 6 min | 350 | Medicinal Herb ×3, Pollen ×2, Distilled Water ×1 |
| Catalyst Synthesis | Catalyst ×1 | 10 min | 550 | Luminous Mushroom ×2, Coal ×1, Sulfur ×1 |
| Healing Potion Brew | Healing Potion ×1 | 7 min | 400 | Medicinal Herb ×3, Distilled Water ×2, Salt ×1 |
| Growth Elixir Brew | Growth Elixir ×1 | 10 min | 550 | Fertilizer ×1, Luminous Mushroom ×1, Distilled Water ×1 |
| Smelter's Tonic Brew | Smelter's Tonic ×1 | 10 min | 550 | Catalyst ×1, Chemical Ore ×1, Sulfur ×1 |
| Mana Elixir Brew | Mana Elixir ×1 | 14 min | 700 | Chemical Ore ×2, Luminous Mushroom ×1, Gem ×1, Distilled Water ×1 |

#### Textilis Recipes (SEW)

| Recipe | Output | Time | Unlock | Ingredients |
|---|---|---|---|---|
| Sew Fiber Hood | Fiber Hood ×1 | 25 min | 200 | Raw Cotton ×3, Cotton Thread ×2 |
| Sew Woven Vest | Woven Vest ×1 | 35 min | 300 | Raw Cotton ×4, Cotton Thread ×3 |
| Sew Wool Coat | Wool Coat ×1 | 40 min | 320 | Sheep Wool ×4, Wool Thread ×3 |
| Sew Cargo Shorts | Cargo Shorts ×1 | 30 min | 220 | Raw Cotton ×3, Cotton Thread ×2 |
| Sew Linen Backpack | Linen Backpack ×1 | 35 min | 260 | Sheep Wool ×3, Wool Thread ×2 |
| Sew Wool Mittens | Wool Mittens ×1 | 20 min | 180 | Sheep Wool ×2, Wool Thread ×2 |
| Sew Canvas Shoes | Canvas Shoes ×1 | 25 min | 200 | Raw Cotton ×3, Cotton Thread ×2 |
| Craft Enchant Stone | Enchant Stone ×1 | 5 min | 300 | Fiber Thread ×3, Salt ×1 |
| Craft Rune Shard | Rune Shard ×1 | 15 min | 800 | Enchant Stone ×2, Iron Ingot ×1, Flux ×1 |
| Craft Arcane Crystal | Arcane Crystal ×1 | 40 min | 2000 | Rune Shard ×2, Steel Ingot ×1, Oil ×1 |

---

## 16. ระบบ Daily Quest

### โครงสร้าง
- แต่ละเมืองมี quest templates ที่ active
- ผู้เล่นได้ **6 quests ต่อวัน** (random จาก templates)
- Reset ตอน **UTC midnight** ทุกวัน

### Quest Flow
1. เปิดหน้า Quest → เห็น 6 quests พร้อม requirements
2. ตรวจสอบว่ามีของครบใน inventory
3. กด Submit → หัก items, ได้ rewards (credits + EXP)
4. EXP แบ่งให้ first_job = floor(exp/2), secondary_job = exp - floor(exp/2)

### ตัวอย่าง Quests

**Agraria:**
- Morning Market Order: Chicken Salad ×5 → 1,140 credits + 60 EXP
- Noble's Dinner: Beef Steak ×3 → 1,320 credits + 75 EXP
- Winter Stew Order: Beef Stew ×3 → 1,440 credits + 84 EXP
- Festival Catering: Chicken Stew ×3 → 1,350 credits + 78 EXP
- Mixed Banquet Platter: Beef Steak ×2 + Chicken Salad ×2 → 1,620 credits + 96 EXP
- Tavern Special: Beef Stew ×2 + Chicken Stew ×2 → 1,740 credits + 105 EXP

**Ferrum:**
- Forge Stockpile: Iron Ingot ×5 → 1,080 credits + 60 EXP
- Wiring Commission: Copper Ingot ×4 → 1,200 credits + 69 EXP
- Heavy Construction: Steel Ingot ×3 → 1,350 credits + 81 EXP
- Farmer's Tool Kit: Fork ×1 + Spatula ×1 → 1,440 credits + 87 EXP
- Mining Equipment Order: Hammer ×1 + Mattock ×1 → 1,590 credits + 96 EXP
- Alloy Shipment: Iron Ingot ×3 + Copper Ingot ×2 → 1,560 credits + 90 EXP

**Voltara:**
- Gas Line Refill: Gas ×5 → 1,110 credits + 60 EXP
- Machinery Lubrication: Oil ×4 → 1,290 credits + 75 EXP
- Power Grid Upgrade: Fuel Cell ×2 → 1,620 credits + 96 EXP
- Energy Bundle: Gas ×3 + Oil ×2 → 1,410 credits + 84 EXP
- Emergency Fuel: Fuel Cell ×1 + Gas ×3 → 1,530 credits + 90 EXP
- Industrial Refining: Oil ×3 + Fuel Cell ×1 → 1,680 credits + 102 EXP

**Medico:**
- Agricultural Support: Fertilizer ×4 → 1,110 credits + 60 EXP
- Field Medic: Healing Potion ×3 → 1,440 credits + 87 EXP
- Growth Season: Growth Elixir ×2 → 1,290 credits + 78 EXP
- Smelter Health: Smelter's Tonic ×2 → 1,290 credits + 78 EXP
- Arcane Research: Mana Elixir ×1 + Healing Potion ×2 → 1,740 credits + 105 EXP
- Chemistry Supplies: Catalyst ×2 + Fertilizer ×3 → 1,650 credits + 96 EXP

**Textilis:**
- Head Gear: Fiber Hood ×1 → 1,290 credits + 78 EXP
- Field Worker: Woven Vest ×1 + Cargo Shorts ×1 → 1,740 credits + 102 EXP
- Cold Season: Wool Coat ×1 → 1,440 credits + 87 EXP
- Glove Resupply: Wool Mittens ×2 → 1,350 credits + 81 EXP
- Traveler's Kit: Linen Backpack ×1 + Canvas Shoes ×1 → 1,590 credits + 93 EXP
- Elite Commission: Woven Vest ×1 + Wool Coat ×1 → 1,890 credits + 114 EXP

---

## 17. ระบบ Cargo & Shipment

### Cargo Box

| Size | Capacity (items) | Price |
|---|---|---|
| S | 5 | 50 credits |
| M | 10 | 100 credits |
| L | 15 | 200 credits |

- Max boxes per player: **5**

### Cargo Box Lifecycle
```
EMPTY → (pack items) → PACKING → (seal) → PACKED → (list on market) → LISTED 
→ (someone buys) → SOLD → (load on ship) → ON_SHIP → (ship arrives) → AT_PORT 
→ (buyer claims) → CLAIMED
```

### Cargo Actions
1. **Buy Box**: เลือกขนาด S/M/L → จ่ายเงิน → ได้กล่อง EMPTY
2. **Pack**: เลือก item จาก inventory → ใส่กล่อง (preserve rarity/enchant/durability)
3. **Unpack**: ดึง item ออกจากกล่องกลับ inventory
4. **Seal (Finalize)**: ล็อคกล่อง → PACKED (พร้อมขาย)
5. **List on Market**: ตั้งราคา → สร้าง cross-city listing
6. **Discard**: ทำลายกล่อง → คืน items ทั้งหมดกลับ inventory

### Purchase Order (ระบบสั่งซื้อข้ามเมือง)
```
PurchaseOrder {
  cargo_box_id: int
  listing_id: int
  buyer_id: int
  seller_id: int
  price: int
  locked_amount: int     # เงินที่ lock ไว้ (price + estimated import tax)
  export_tax: int
  import_tax: int
  status: "PENDING" | "CANCELLED_BUYER" | "CANCELLED_TIMEOUT" | "SHIPPING" | "DELIVERED" | "CLAIMED" | "PIRATED"
  expires_at: datetime   # 10 minutes timeout
}
```

### Cross-City Buy Flow
1. Buyer กด Buy → lock money (price + estimated import tax)
2. สร้าง Purchase Order (status = PENDING, expires in 10 min)
3. **Seller ต้อง load กล่องขึ้นเรือ** ภายใน 10 นาที
4. ถ้า seller ไม่ load → order ถูก cancel → buyer refund ทั้งหมด
5. ถ้า load → status = SHIPPING → เรือออกเดินทาง
6. เรือถึง → คำนวณภาษีจริง → จ่ายเงิน → status = DELIVERED
7. Buyer ไป Port claim กล่อง → items เข้า inventory

### Same-City Buy (Direct)
- ถ้า buyer + seller อยู่เมืองเดียวกัน → ของเข้า inventory ทันที (ไม่ต้องใช้เรือ)
- Bot seller → instant delivery พร้อมคำนวณภาษี

---

## 18. ระบบ Ship & World Map

### Shipping Routes (10 เส้นทาง)

| จาก | ไป | ระยะทาง (nm) | เวลาเดินทาง (sec) |
|---|---|---|---|
| FERRUM | VOLTARA | 80 nm | 80s |
| AGRARIA | TEXTILIS | 90 nm | 90s |
| AGRARIA | FERRUM | 120 nm | 120s |
| VOLTARA | MEDICO | 150 nm | 150s |
| AGRARIA | VOLTARA | 180 nm | 180s |
| TEXTILIS | MEDICO | 180 nm | 180s |
| FERRUM | TEXTILIS | 200 nm | 200s |
| AGRARIA | MEDICO | 250 nm | 250s |
| VOLTARA | TEXTILIS | 260 nm | 260s |
| FERRUM | MEDICO | 300 nm | 300s |

**Formula:** 1 nautical mile = 1 second travel time

### Public Ships
- **Capacity**: 10 cargo boxes
- **Departure interval**: ทุก 5 นาที
- ระบบสร้าง 1 เรือ per route (10 เส้นทาง = 20 เรือ bidirectional)
- เรือว่างจะ skip departure (reschedule)

### Private Ships

| Size | Capacity | Fuel Cell Cost | RPS Slots |
|---|---|---|---|
| S | 3 boxes | 1 Fuel Cell | 3 |
| M | 5 boxes | 2 Fuel Cells | 5 |
| L | 10 boxes | 3 Fuel Cells | 7 |

- ผู้เล่นเช่าเรือ → เลือกปลายทาง → ตั้ง RPS defense sequence → load cargo → dispatch

### Ship Model
```
Ship {
  type: "PUBLIC" | "PRIVATE"
  size: "S" | "M" | "L"?
  owner_id: int?
  origin_city: string
  dest_city: string
  status: "DOCKED" | "LOADING" | "SAILING" | "ARRIVED"
  capacity: int
  departs_at: datetime?
  departed_at: datetime?
  arrives_at: datetime?
  rps_sequence: string?    # JSON array of ROCK/PAPER/SCISSORS
  is_bot_ship: bool
}
```

### World Map Display
- SVG-based map (1400×700) แสดง:
  - 5 เมืองเป็นจุดบนแผนที่ (territory polygons)
  - เส้นทางเรือ (curved paths + distance labels)
  - เรือที่กำลังแล่น (interpolated position based on departed_at → arrives_at)
  - เรือจอด (ที่ท่าเรือ)
  - Compass rose, scale bar
- Auto-refresh ทุก 10 วินาที

### Ship Animation ใน Godot
```
# Position interpolation
progress = (now - departed_at) / (arrives_at - departed_at)
position = lerp(origin_city_pos, dest_city_pos, progress)
```

---

## 19. ระบบ Pirate Attack (PvP)

### Pirate Config

| Ship Size | Fuel Cell Cost | Credit Cost | RPS Rounds |
|---|---|---|---|
| S | 1 | 500 | 3 rounds |
| M | 2 | 1,000 | 5 rounds |
| L | 3 | 2,000 | 7 rounds |

- **Cooldown**: 30 นาที หลังจากโจมตี

### Attack Flow
1. เลือก target ship (ต้องเป็น PRIVATE + SAILING + ไม่ใช่ bot/ตัวเอง)
2. เลือก fleet size (S/M/L) → จ่าย Fuel Cells + Credits
3. สร้าง RPS sequence (ROCK/PAPER/SCISSORS) ตามจำนวน rounds
4. Combat resolution:
   - เปรียบเทียบ attacker RPS กับ defender RPS (ตั้งตอนเช่าเรือ)
   - Win: +1 attacker, Lose: +1 defender, Draw: +1 draws
5. **Success** (attacker_wins > defender_wins):
   - ทุก cargo ในเรือถูกโอนเป็น pirate loot ที่ port ของ attacker
   - Original orders → status = PIRATED
   - Buyer สูญเสีย locked money (ไม่ refund)
6. **Failure**:
   - เสีย Fuel Cells + Credits (จ่ายไปแล้ว)
   - เรือเดินทางต่อปกติ

### Pirate Loot
- ไปรับที่ Port → "Pirate Loot" section (สีแดง)
- Claim เหมือน trade cargo ปกติ

---

## 20. ระบบ Port & Claim

### Port Storage
- แต่ละ user มี port storage per city (max 5 slots)
- แสดง:
  - **Trade Cargo**: กล่องที่ซื้อมาถึงปลายทาง (status = AT_PORT + DELIVERED)
  - **Pirate Loot**: กล่องที่ปล้นได้ (status = AT_PORT/PIRATED)

### Claim Flow
1. กด Claim → ตรวจสอบ inventory space
2. items จากกล่องเข้า inventory (stack ถ้าได้, ใช้ slot ว่างถ้าไม่ได้)
3. Order status → CLAIMED, Box status → CLAIMED

---

## 21. ระบบ City Governance & Election

### Election System
- **Cycle**: 7 วัน (เริ่มนับจาก 2026-01-01 00:00 UTC)
- **Voting**: ผู้เล่นในเมือง vote ให้ candidate (เปลี่ยนได้ระหว่าง cycle)
- **Winner**: simple plurality (คนที่ได้ vote มากสุด)
- **Mayor Powers**:
  - ปรับ domestic/export/import tax (0-12%, step 0.5%)
  - แสดง crown icon

### Cycle Transition
- เมื่อจบ cycle → mayor เก่าถูก reset เป็น CITIZEN
- Vote ใหม่เริ่มต้น
- Mayor ใหม่ได้รับ role = MAYOR

### UI Display
- City Status panel แสดง:
  - ชื่อเมือง, tier, tax rates
  - Treasury progress bar (ก้าวไปถึง tier ถัดไป)
  - Mayor section: ผู้สมัคร, ปุ่ม vote, results
  - Tax controls (สำหรับ mayor)

---

## 22. ระบบ Notification

### Notification Types
- `SHIP_DEPARTED`: เรือออกเดินทางแล้ว
- `SHIP_ARRIVED`: เรือถึงปลายทาง
- `SETTLEMENT_COMPLETE`: การชำระเงินเสร็จ
- `ORDER_CANCELLED`: order ถูกยกเลิก
- `PIRATE_ATTACK`: ถูกโจมตี / โจมตีสำเร็จ
- `CARGO_DELIVERED`: สินค้าถึงแล้ว

### Notification Model
```
Notification {
  user_id: int
  type: string
  title: string
  body: string           # ข้อความยาว
  metadata: string?      # JSON: { link, orderId, etc. }
  is_read: bool
  created_at: datetime
}
```

### UI
- Bell icon ใน navbar + unread count badge
- Dropdown แสดง notifications (scroll ได้)
- Click → navigate ไปหน้าที่เกี่ยวข้อง
- Mark as read / Mark all read
- Poll ทุก 10 วินาที

---

## 23. ระบบ Market Bot (NPC Automation)

### Bot Behavior
- **Tick interval**: 15 วินาที
- **Buy**: 80% chance per tick, ซื้อ max 2 listings, round-robin ระหว่าง sellers
- **Sell**: สร้าง listings ตาม city-local items
- **Anti-overprice**: ราคาต่อหน่วย ≤ reference × 5
- **Cooldown**: sell feed ทุก 60 วินาที

### Bot Sell Items per City

- **AGRARIA**: Chicken Meat, Beef Meat, Vegetable, Salt, Chicken Salad, Beef Steak, Beef Stew, Chicken Stew
- **FERRUM**: Iron Ore, Copper Ore, Steel Ore, Coal, Gem, Iron Ingot, Copper Ingot, Steel Ingot
- **VOLTARA**: Gas, Oil
- **MEDICO**: Flux
- **TEXTILIS**: Raw Cotton, Sheep Wool, Cotton Thread, Wool Thread

### Bot Cargo (Cross-city)
- 30% chance per tick
- สร้าง packed cargo boxes (1-3 items, 2-8 qty each)
- ราคา 0.9-1.3x reference
- Max 20 active cargo listings

### Bot Users
- Max 200 NPC accounts
- Email format: `npc_XXX@npc.market`
- สุ่ม assign เมือง

---

## 24. ระบบ Level & EXP

### Level Thresholds (Quadratic)
```
EXP_for_level[n] = n² × 100
```

| Level | Total EXP Required |
|---|---|
| 1 | 0 |
| 2 | 400 |
| 5 | 2,500 |
| 10 | 10,000 |
| 15 | 22,500 |
| 20 | 40,000 |
| 25 | 62,500 |
| 30 | 90,000 |
| 40 | 160,000 |
| 50 (MAX) | 250,000 |

### EXP Sources

#### Work EXP (จากการทำงาน)
- First job: multiplier = 0.2
- Secondary job: multiplier = 0.4
- ให้ EXP เมื่อ collect work order

#### Market EXP (จากการขายในตลาด)
```
hunger_ratio = current_hunger / MAX_HUNGER   # 0-1
enchant_multiplier = 1 + enchant_exp_gain_pct
exp_gained = floor(hunger_ratio × item.exp_value × sale_price × exp_multiplier × enchant_multiplier)
```
- จะได้ EXP มากขึ้นเมื่อ hunger สูง (incentivize eating)
- item.exp_value กำหนดต่อ item type

### Auto-Unlock Secondary Job
เมื่อ first_job ถึง level 5 → auto-unlock secondary job + ให้ starter recipes ฟรี

---

## 25. ระบบ i18n (Localization)

### Supported Languages
- **English (en)** — default
- **Thai (th)** — complete translation

### Key Namespaces

| Namespace | จำนวน Keys | เนื้อหา |
|---|---|---|
| nav | 6 | Navigation labels |
| common | 31 | ปุ่มทั่วไป, rarity names |
| auth | 10 | Login/register |
| dashboard | 37 | City status, buffs, skills |
| marketplace | 85+ | ตลาด, NPC shop, recipe shop |
| class_selection | 16 | เลือกเมือง |
| workspace | 30+ | การทำงาน, mining layers |
| inventory | 35+ | Equipment, effects |
| active_orders | 30+ | Order status |
| hunger | 6 | Hunger states |

### Godot Implementation
```gdscript
# res://autoload/LocaleManager.gd
var locale_data: Dictionary = {}
var current_locale: String = "en"

func load_locale(lang: String):
    var file = FileAccess.open("res://resources/data/locale/%s.json" % lang, FileAccess.READ)
    locale_data = JSON.parse_string(file.get_as_text())

func t(key: String, params: Dictionary = {}) -> String:
    var keys = key.split(".")
    var value = locale_data
    for k in keys:
        value = value.get(k, key)
    for param_key in params:
        value = value.replace("{{%s}}" % param_key, str(params[param_key]))
    return value
```

---

## 26. Item Catalog (Master Data)

### Item Types

| Type | จำนวน | ตัวอย่าง |
|---|---|---|
| SEED | 14 items | Chicken Egg, Beef Calf, Cotton Seed, Herb Seed, Fiber Seed |
| RAW | 20 items | Chicken Meat, Iron Ore, Raw Cotton, Fiber Thread |
| INGREDIENT | 21 items | Salt, Coal, Iron Ingot, Enchant Stone, Rune Shard |
| MEAL | 8 items | Chicken Salad, Healing Potion, Mana Elixir |
| EQUIPMENT | 22+ items | Sun Hat, Fork, Loom, Wool Coat, Canvas Shoes |

### Item Fields
```
Item {
  name: string (unique)
  type: SEED | RAW | INGREDIENT | MEAL | EQUIPMENT
  equipment_slot: HEAD | UPPER_BODY | LOWER_BODY | ARM | GLOVE | SHOE (nullable)
  effect_key: string?      # Equipment effect identifier
  effect_value: float?     # Primary effect value
  effect_value2: float?    # Secondary effect value (some items)
  buy_price: int?          # NPC shop price (null = not buyable)
  sell_price: int?         # NPC sell price (null = not sellable)
  kcal: int?               # Hunger restore when eaten
  buff_pct: float?         # Satiety decay slowdown % (e.g., 0.05 = 5%)
  buff_mins: int?          # Buff duration in real minutes
  max_stack: int           # Max inventory stack (1 for equipment)
  grow_mins: int?          # Grow time for seeds
  yield_item_id: int?      # Item produced when harvested
  yield_qty: int?          # Quantity produced
  exp_value: float         # Base EXP multiplier for market sales
  icon: string             # Icon identifier / emoji
}
```

### Complete Equipment List with Effects

| Item | Slot | Effect | Value | City Shop |
|---|---|---|---|---|
| Sun Hat | HEAD | hunger_penalty_tier_reduction | 1 tier | Agraria |
| Toque Blanche | HEAD | cook_secondary_ingredient_save_chance | 10% | Agraria |
| Field Shirt | UPPER_BODY | max_hunger_bonus | +300 Kcal | Agraria |
| Apron | UPPER_BODY | max_hunger_and_satiety_bonus | +150 Kcal, +10% buff | Agraria |
| Cargo Pants | LOWER_BODY | raw_stack_bonus | +5 | Agraria |
| Slack Pants | LOWER_BODY | ingredient_stack_bonus | +5 | Agraria |
| Sweatband | ARM | farm_time_reduction_pct | 10% | Agraria |
| Wrist Support | ARM | cook_time_reduction_pct | 10% | Agraria |
| Work Gloves | GLOVE | farm_double_yield_chance | 8% | Agraria |
| Latex Gloves | GLOVE | gourmet_chance | 8% | Agraria |
| Mud Boots | SHOE | hunger_decay_reduction_per_min | 1.5 Kcal/min | Agraria |
| Anti-Slip Shoes | SHOE | cook_state_hunger_decay_reduction_pct | 20% | Agraria |
| Fork | ARM | (city tool) | - | Agraria |
| Spatula | ARM | (city tool) | - | Agraria |
| Mattock | ARM | (city tool) | - | Ferrum |
| Hammer | ARM | (city tool) | - | Ferrum |
| Wrench | ARM | (city tool) | - | Voltara |
| Soldering Iron | ARM | (city tool) | - | Voltara |
| Sickle | ARM | (city tool) | - | Medico |
| Mortar & Pestle | ARM | (city tool) | - | Medico |
| Loom | ARM | farm_time_reduction_pct | 8% | Textilis |
| Sewing Kit | ARM | cook_time_reduction_pct | 8% | Textilis |
| Fiber Hood | HEAD | max_hunger_bonus | +400 Kcal | Textilis (craft) |
| Woven Vest | UPPER_BODY | farm_time_reduction_pct | 15% | Textilis (craft) |
| Wool Coat | UPPER_BODY | hunger_decay_reduction_per_min | 2 Kcal/min | Textilis (craft) |
| Cargo Shorts | LOWER_BODY | raw_stack_bonus | +8 | Textilis (craft) |
| Linen Backpack | LOWER_BODY | ingredient_stack_bonus | +8 | Textilis (craft) |
| Wool Mittens | GLOVE | farm_double_yield_chance | 8% | Textilis (craft) |
| Canvas Shoes | SHOE | cook_time_reduction_pct | 10% | Textilis (craft) |

### Complete Meal List

| Meal | Kcal | Buff % | Buff Duration | Sell Price | City |
|---|---|---|---|---|---|
| Chicken Salad | 200 | 5% | 30 min | 150 | Agraria |
| Beef Steak | 300 | 15% | 45 min | 400 | Agraria |
| Beef Stew | 350 | 15% | 45 min | 400 | Agraria |
| Chicken Stew | 280 | 15% | 45 min | 400 | Agraria |
| Healing Potion | 400 | 0% | 0 min | 350 | Medico |
| Growth Elixir | 100 | 15% | 40 min | 280 | Medico |
| Smelter's Tonic | 100 | 15% | 40 min | 280 | Medico |
| Mana Elixir | 100 | 20% | 30 min | 400 | Medico |

---

## 27. Visual & Animation Spec สำหรับ Godot

### สิ่งที่ Web version ทำไม่ได้ → Godot ทำได้

#### 1. Workspace Animations (จุดเด่นหลัก)

**Farm Plot Animation:**
```
- พืชงอกจากดิน (sprout → grow → bloom) แบบ sprite animation
- ควันขึ้นจากเตา (particle system)
- เปลวไฟ forge สำหรับ smelting (shader)
- น้ำไหลในท่อสำหรับ extraction (animated shader)
- กี่ทอผ้าขยับ (skeletal animation)
- หม้อต้มเดือด (particle + shader)
```

**Mining Animation:**
```
- หน้าจอแสดง cross-section ของเหมือง 3 ชั้น
- ขุดแต่ละช่อง: ฝุ่นกระจาย (CPUParticles2D)
- แร่ปรากฏ (pop-up animation + sparkle)
- Deep/Core: แสงสลัว, หยดน้ำ, เสียงลึกลับ
```

**Collect Animation:**
```
- item ลอยขึ้น + spin + fly เข้า inventory
- rarity glow (LEGENDARY = golden burst particles)
- double yield = "×2!" popup text
- gourmet = upgrade sparkle + rarity shift
```

#### 2. Ship & World Map

**Ocean Animation:**
```
- คลื่นทะเล (GPU shader: sin/cos wave displacement)
- เรือแกว่งตาม wave (rotation oscillation)
- wake trail ด้านหลังเรือ (particle trail)
- day/night cycle (gradient sky)
- เมฆลอย (parallax scrolling)
```

**Ship Movement:**
```
- เรือเลื่อนตาม bezier curve ระหว่างเมือง (ไม่ใช่เส้นตรง)
- เรือหมุน face ทิศทาง
- arrival: เรือเข้าที่จอด + สมอลง
```

**Pirate Battle:**
```
- Battle scene: เรือ 2 ลำเผชิญหน้า
- RPS round animation: countdown 3-2-1 → reveal
- Win: ✊>✂️ (crash effect), Lose: ✋>✊ (block effect)
- Victory: เรือโจรสลัดพ่น confetti, loot flies
- Defeat: เรือโจรสลัดถอยหนี + smoke
```

#### 3. Enchantment

**Enchant Animation:**
```
- อุปกรณ์ลอยกลาง + magic circle หมุนรอบ
- materials ถูกดูดเข้า (tween + particles)
- Roll animation: วงล้อหมุน / flash
- Success: burst light + upgrade glow + level number scale up
- Failure: crack effect + shake + drop
- Destroy: shatter animation (pieces fly) + screen flash red
- Milestone stat: mystic orb appears + stat text reveal
```

#### 4. Market & Trading

```
- ซื้อขาย: coins fly animation
- listing สร้าง: item slides onto shelf
- NPC shop: shopkeeper NPC พูดคุย
- Equipment box gacha: chest opening animation + reveal
```

#### 5. Hunger/Eating

```
- กินอาหาร: item shrink + eat effect + health bar fill
- buff activate: glow aura around character
- starving: screen edge red vignette + heartbeat sound
- Hunger bar: animated liquid fill with bubble particles
```

#### 6. Quest

```
- Quest card: scroll/parchment style
- Submit: items fly from inventory to quest board
- Complete: stamp animation (✓) + reward coins fall
- All complete: celebration confetti + fanfare
```

#### 7. Dashboard

```
- City panorama background (ต่างกล่อง per city)
- Character avatar with equipped items visible
- Equipment durability: animated crack overlay เมื่อเลว
- Level up: burst + number increment + sound
```

### City-Specific Visual Themes

| City | บรรยากาศ | สี dominant | Particle effects |
|---|---|---|---|
| Agraria | Farm, green fields | Green/warm | Pollen, leaves |
| Ferrum | Industrial, forge | Gray/amber | Sparks, smoke |
| Voltara | Hi-tech, neon | Cyan/yellow | Electric arcs, circuits |
| Textilis | Cozy, fabric | Purple/pastel | Thread particles, fabric swirl |
| Medico | Lab, mystical | Blue/glow | Bubbles, chemical mist |

---

## 28. Godot Scene Structure

### Main Scenes

#### LoginScene.tscn
```
LoginScene (Control)
├── BackgroundLayer (ParallaxBackground)
│   ├── ForgeGlow (ColorRect + shader)
│   └── EmberParticles (CPUParticles2D)
├── LoginCard (PanelContainer)
│   ├── Logo (TextureRect + AnimationPlayer)
│   ├── EmailField (LineEdit)
│   ├── PasswordField (LineEdit)
│   ├── ConfirmPasswordField (LineEdit) [toggle visibility]
│   ├── SubmitButton (Button)
│   └── ToggleModeButton (Button)
└── LanguageSwitcher (OptionButton)
```

#### DashboardScene.tscn
```
DashboardScene (Control)
├── TopNavBar (instance)
├── CityBackground (TextureRect per city)
├── HBoxContainer
│   ├── LeftPanel (VBoxContainer)
│   │   ├── CityStatusPanel (PanelContainer)
│   │   │   ├── CityName + Tier badge
│   │   │   ├── TaxBadges (HBox)
│   │   │   ├── MayorSection
│   │   │   └── TreasuryBar (ProgressBar)
│   │   └── ActiveOrdersPanel (per-city scene instance)
│   ├── CenterPanel (VBoxContainer)
│   │   ├── ProfileCard
│   │   │   ├── Avatar
│   │   │   ├── HungerBar (instance)
│   │   │   ├── OccupationCard ×2
│   │   │   └── ActiveBuffs
│   │   └── InventoryGrid (instance)
│   └── RightPanel (VBoxContainer)
│       └── WorkspacePanel (per-city scene instance)
└── ModalLayer (CanvasLayer)
    ├── SkillTreeModal
    ├── EnchantModal
    └── RepairModal
```

#### WorkspacePanel — Per City

**AgrariaWorkspace.tscn:**
```
AgrariaWorkspace
├── SeedSelector (ItemList: shows SEED type items from inventory)
├── FarmGrid (GridContainer 3×3)
│   └── FarmSlot ×9 (TextureButton + ProgressBar + Timer + Sprite2D)
├── FarmStatusBadge ("PLOT FULL -10%")
└── CookingQueue (VBoxContainer)
    ├── RecipeSelector
    ├── IngredientPicker
    └── QueueSlots (HBox of CookSlot instances)
```

**FerrumWorkspace.tscn:**
```
FerrumWorkspace
├── LayerSelector (3 buttons: Surface/Deep/Core)
├── MineGrid (VBoxContainer)
│   ├── SurfaceRow (3 × MineSlot)
│   ├── DeepRow (3 × MineSlot)
│   └── CoreRow (3 × MineSlot)
├── SafetyHelmetAlert (Label)
└── SmeltingQueue (same as CookingQueue)
```

**VoltaraWorkspace.tscn:**
```
VoltaraWorkspace
├── ResourceSelector
├── CircuitGrid (custom: center + 8 ring nodes)
│   └── CircuitNode ×9 (with SVG arc progress)
└── RefineQueue
```

**TextilisWorkspace.tscn:**
```
TextilisWorkspace
├── MaterialSelector
├── GatherGrid (GridContainer 2×3)
│   └── GatherSlot ×6
└── SewQueue + EnchantButton
```

**MedicoWorkspace.tscn:**
```
MedicoWorkspace
├── SpecimenSelector
├── PentagonGrid (custom: center + 5 vertex nodes)
│   └── ForageNode ×6
└── BrewQueue (with test-tube animation)
```

#### WorldMapScene.tscn
```
WorldMapScene (Control)
├── TopNavBar
├── HSplitContainer
│   ├── MapViewport (SubViewportContainer)
│   │   └── MapScene (Node2D)
│   │       ├── OceanBackground (ColorRect + ocean shader)
│   │       ├── GridLines (Line2D ×multiple)
│   │       ├── IslandPolygons (Polygon2D ×5)
│   │       ├── ShippingRoutes (Line2D ×10 + Labels)
│   │       ├── CityNodes (Node2D ×5)
│   │       │   └── CityPin (animated multi-ring)
│   │       ├── Ships (Node2D)
│   │       │   └── ShipSprite ×N (interpolated position)
│   │       └── CompassRose + ScaleBar
│   └── SidePanel (VBoxContainer)
│       ├── TerritoriesLegend
│       ├── SailingShipsList (ScrollContainer)
│       ├── NextDeparturesList (ScrollContainer)
│       └── PirateAttackPanel
│           ├── CooldownDisplay
│           ├── TargetInfo
│           ├── FleetSizeSelector (S/M/L)
│           ├── RPSSequenceBuilder
│           └── LaunchAttackButton
└── ConfirmDialog (Popup)
```

---

## 29. Database Schema (SQLite for Desktop)

สำหรับ offline single-player mode ใช้ SQLite แทน MySQL

### Table Mapping (Prisma → SQLite)

ใช้ schema เดียวกัน แต่:
- `BIGINT` → `INTEGER`
- `ENUM` → `TEXT` with CHECK constraint
- `AUTO_INCREMENT` → `AUTOINCREMENT`
- `DateTime` → `TEXT` (ISO 8601 format)
- `Json` → `TEXT` (JSON string)

```sql
-- Core tables เท่าที่ต้องการสำหรับ single-player
CREATE TABLE users (...);
CREATE TABLE items (...);
CREATE TABLE recipes (...);
CREATE TABLE recipe_ingredients (...);
CREATE TABLE inventory_slots (...);
CREATE TABLE user_equipments (...);
CREATE TABLE work_orders (...);
CREATE TABLE market_listings (...);
CREATE TABLE user_recipe_unlocks (...);
CREATE TABLE game_settings (...);
CREATE TABLE city_states (...);
CREATE TABLE occupation_catalog (...);
CREATE TABLE occupation_skill_branch_catalog (...);
CREATE TABLE user_job_progress (...);
CREATE TABLE user_skill_progress (...);
CREATE TABLE daily_quest_templates (...);
CREATE TABLE daily_quest_requirements (...);
CREATE TABLE player_daily_quests (...);
CREATE TABLE cargo_boxes (...);
CREATE TABLE cargo_box_items (...);
CREATE TABLE purchase_orders (...);
CREATE TABLE ships (...);
CREATE TABLE ship_cargo (...);
CREATE TABLE pirate_attacks (...);
CREATE TABLE notifications (...);
CREATE TABLE pirate_cooldowns (...);
CREATE TABLE user_port_storage (...);
-- City rule tables
CREATE TABLE city_shop_item_rules (...);
CREATE TABLE city_shop_recipe_rules (...);
CREATE TABLE city_workspace_rules (...);
```

---

## 30. API → Local Service Layer Mapping

สำหรับ Godot desktop ต้อง port server logic เป็น GDScript services

| Server Service | Godot Script | หน้าที่ |
|---|---|---|
| auth.controller | AuthManager.gd (autoload) | Login/register/token |
| city.service | CityService.gd | City selection, taxes, election |
| hunger.service | HungerService.gd | Hunger decay, eat, pause |
| durability.service | DurabilityService.gd | Equipment wear |
| enchantment.service | EnchantmentService.gd | Enchant attempts |
| equipmentEffects.service | EquipmentEffectsService.gd | Aggregate buffs |
| gamePricing.service | GameConfig.gd | Runtime config |
| level.service | LevelService.gd | EXP calculation |
| marketBot.service | MarketBotService.gd | NPC automation |
| quest.service | QuestService.gd | Daily quests |
| shipment.service | ShipmentService.gd | Ship scheduling |
| workspaceRules.service | WorkspaceRulesService.gd | Workspace validation |
| workspace.controller | WorkspaceManager.gd | Work order CRUD |
| inventory.controller | InventoryManager.gd | Item CRUD |
| market.controller | MarketManager.gd | Listings CRUD |
| shop.controller | ShopManager.gd | NPC shop logic |
| cargo.controller | CargoManager.gd | Cargo box CRUD |
| pirate.controller | PirateManager.gd | Attack logic |
| port.controller | PortManager.gd | Claim logic |
| notification.controller | NotificationManager.gd | Notifications |

### Game Loop (Godot _process)
```gdscript
# GameManager.gd
func _process(delta: float):
    _tick_hunger(delta)        # ทุก frame: recalculate hunger display
    _tick_durability(delta)    # ทุก frame: recalculate durability
    _tick_work_orders(delta)   # ทุก frame: update progress bars
    
    # ทุก 1 วินาที
    _second_timer += delta
    if _second_timer >= 1.0:
        _second_timer -= 1.0
        _sync_hunger_to_db()
        _check_completed_orders()
        _update_ship_positions()
    
    # ทุก 15 วินาที
    _bot_timer += delta
    if _bot_timer >= 15.0:
        _bot_timer -= 15.0
        MarketBotService.tick()
    
    # ทุก 30 วินาที
    _ship_timer += delta
    if _ship_timer >= 30.0:
        _ship_timer -= 30.0
        ShipmentService.depart_public_ships()
        ShipmentService.cancel_expired_orders()
    
    # ทุก 3 วินาที
    _arrive_timer += delta
    if _arrive_timer >= 3.0:
        _arrive_timer -= 3.0
        ShipmentService.arrive_ships()
```

---

## Summary: Feature Completeness Checklist

| # | Feature | Priority | Complexity |
|---|---|---|---|
| 1 | Auth (Login/Register) | HIGH | Low |
| 2 | City Selection (5 cities) | HIGH | Medium |
| 3 | Inventory System (16 slots) | HIGH | Medium |
| 4 | Equipment System (6 slots) | HIGH | Medium |
| 5 | Farming/Gathering Workspace | HIGH | High |
| 6 | Mining Workspace (Ferrum) | HIGH | High |
| 7 | Crafting/Cooking Workspace | HIGH | High |
| 8 | Hunger System | HIGH | Medium |
| 9 | Durability System | MEDIUM | Medium |
| 10 | Skill Tree (3 branches) | HIGH | Medium |
| 11 | Level/EXP System | HIGH | Low |
| 12 | NPC Shop | HIGH | Low |
| 13 | Player Market (Same-city) | HIGH | High |
| 14 | Equipment Box (Gacha) | MEDIUM | Low |
| 15 | Recipe System | HIGH | Medium |
| 16 | Enchantment System | MEDIUM | High |
| 17 | Daily Quests | MEDIUM | Medium |
| 18 | Cargo Box System | MEDIUM | High |
| 19 | Ship/Shipment System | MEDIUM | High |
| 20 | World Map (Interactive) | MEDIUM | High |
| 21 | Pirate Attack (PvP) | LOW | High |
| 22 | Port/Claim System | MEDIUM | Medium |
| 23 | City Governance/Election | LOW | Medium |
| 24 | Notification System | MEDIUM | Low |
| 25 | Market Bot (NPC) | LOW | High |
| 26 | Localization (EN/TH) | MEDIUM | Low |
| 27 | Animations & VFX (Godot-exclusive) | HIGH | Very High |
| 28 | Audio (BGM + SFX) | MEDIUM | Medium |
| 29 | Steam Integration | LOW | Medium |
| 30 | Save/Load System | HIGH | Medium |

---

> **Note**: เอกสารนี้ cover ทุก feature ที่มีในโค้ดต้นฉบับ 100% — ทั้ง server logic, client UI, data models, formulas, constants, และ visual behaviors
> สามารถใช้เป็น prompt ให้ AI สร้าง Godot project ที่ reproduce ระบบทั้งหมดได้ครบถ้วน
> ส่วนที่เพิ่มเติมจาก web คือส่วน animations/VFX ที่ Godot สามารถทำได้ดีกว่า
