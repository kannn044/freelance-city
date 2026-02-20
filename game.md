# Freelance City - Project Analysis & Documentation

## 1. Project Overview
**Freelance City** is a web-based management simulation game focused on a player-driven economy and survival mechanics. Players take on roles (occupations) to produce resources, craft items, and trade in a dynamic marketplace. The game's core loop revolves around managing **Hunger (Kcal)**, which serves as both a survival metric and a "stamina" system for performing work.

### Core Tech Stack
- **Frontend**: React (Vite), TypeScript, Zustand (State Management), Framer Motion (Animations), Tailwind CSS.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM.
- **Database**: MySQL.
- **Authentication**: JWT-based with bcrypt password hashing.

---

## 2. Core Game Mechanics

### 2.1 Metabolism & Survival (Hunger System)
Hunger is the central resource in Freelance City, functioning as the primary cost of activity.

- **Max Hunger**: 2400 Kcal (Can be boosted by equipment).
- **Task-Driven Burn**: Hunger is primarily consumed by **performing tasks**, not just by passive decay.
    - **FARM/MINE**: Consumes Kcal per active plot per second (e.g., 0.01 Kcal/sec per plot).
    - **COOK/SMELT**: Consumes Kcal per active menu per second (e.g., 0.25 Kcal/sec per menu).
    - **Expeditions (Ferrum)**: Deep-layer mining expeditions have a higher initial Kcal cost (e.g., -200 Kcal) and higher burn rates.
- **Hunger Penalty (Efficiency Loss)**: Low hunger levels directly penalize the **speed** of work orders:
    - **Fit (80-100%)**: 1.0x (Normal Speed).
    - **Normal (40-79%)**: 1.2x (Slower).
    - **Hungry (20-39%)**: 1.5x (Much Slower).
    - **Starving (0-19%)**: 2.5x (Critical Speed Penalty).
- **Pause/Resume Logic**: If hunger reaches 0, all active work orders **stop progressing** (pause) and their completion timelines are shifted forward until hunger is restored.


### 2.2 Occupations & Progression
Players can progress through multiple occupations depending on their location.

#### **A. Provider (Agraria - Primary)**
- **Role**: Farming crops and livestock.
- **Workflow**: Buy Seeds/Livestock -> Plant/Wait -> Harvest Raw Materials.
- **Key Buffs**: Faster farming time, increased plot capacity.

#### **B. Miner (Ferrum - Primary)**
- **Role**: Expeditions into mines for ore and gems.
- **Workflow**: Equip Mattock -> Buy Permit -> Run Expedition (Surface/Deep/Core).
- **Key Buffs**: Specialized gear like "Safety Helmet" reduces high-burn hunger penalties in deep layers.

#### **C. Chef (Agraria - Secondary)**
- **Role**: Cooking raw ingredients into buff-giving meals.
- **Workflow**: Buy Ingredients -> Cook -> Produce Meals with Satiety Buffs.
- **Key Buffs**: Ingredient saving chances and parallel cooking slots.

#### **D. Blacksmith (Ferrum - Secondary)**
- **Role**: Smelting ores into refined ingots.
- **Workflow**: Buy Smelting Recipes -> Smelt Ores -> Produce Ingots for high-tier crafting/trade.
- **Key Buffs**: "Alloy Mastery" provides a chance for extra output yields.

#### **Leveling & Skills**
- **Leveling**: Quadratic EXP growth (`level^2 * 100`). Secondary jobs (Chef/Blacksmith) unlock at level 5 of the first job.
- **Skill Trees**: Each job has unique branches:
    - **Provider**: Vegetable, Chicken, Beef (Time reduction & Plot capacity).
    - **Miner**: Mining Prep (Expedition speed), Efficiency (Resource yield).
    - **Chef**: Prep Master (Speed & Parallel slots), Kitchen Economy (Ingredient saving), Market Intel (Bot visibility).
    - **Blacksmith**: Smelting Speed, Alloy Mastery (Bonus output).

### 2.3 Items & Rarity System

#### **Item Categories**
Items in Freelance City are categorized based on their role in the production chain and survival.

| Category | Description | Examples |
| :--- | :--- | :--- |
| **SEED** | Starting materials for primary jobs (Farmer/Miner). | Chicken Egg, Beef Calf, Vegetable Seed, Mining Permit. |
| **RAW** | Unprocessed materials produced from work orders. | Chicken Meat, Beef Meat, Iron Ore, Copper Ore, Gems. |
| **INGREDIENT** | Processing aids or refined materials used in recipes. | Salt, Coal, Flux, Oil, Iron/Copper/Steel Ingots. |
| **MEAL** | Edible items that restore Hunger (Kcal) and provide Satiety Buffs. | Chicken Salad, Beef Steak, Beef Stew. |
| **EQUIPMENT** | Wearable gear providing passive stat bonuses and workspace access. | Mattock (for mining), Fork (for farming), Apron, Sun Hat. |

#### **The Rarity System**
Rarity is a fundamental mechanic that scales the power of equipment and the potency of meals. There are four tiers of rarity:
- **NORMAL**: The baseline standard.
- **RARE**: Enhanced performance.
- **EPIC**: High-tier specialized gear.
- **LEGENDARY**: The pinnacle of efficiency.

#### **Acquiring Rarity**
- **Harvest Rarity**: When collecting RAW materials from FARM/MINE tasks, there is a weighted chance to obtain higher rarity versions:
    - **Normal**: 80% weight
    - **Rare**: 28% weight
    - **Epic**: 1.9% weight
    - **Legendary**: 0.1% weight
- **Equipment Box (Gacha)**: Equipment obtained from boxes follows a stricter probability curve:
    - **Normal**: 95%
    - **Rare**: 4.5%
    - **Epic**: 0.45%
    - **Legendary**: 0.05%

#### **Rarity Effects**
1. **Equipment Scaling**: The passive effect of an equipment item is multiplied by its rarity tier:
    - **Normal**: 0.25x
    - **Rare**: 0.50x
    - **Epic**: 0.75x
    - **Legendary**: 1.0x (Baseline max)
2. **Meal Potency**: High-rarity ingredients used in cooking produce meals with amplified **Satiety Buffs**:
    - **Normal**: 1.0x
    - **Rare**: 1.2x
    - **Epic**: 1.5x
    - **Legendary**: 2.0x (Doubles the hunger decay reduction).
3. **Cooking Rarity Mix**: The rarity of a finished meal is determined by the **top two rarest ingredients** used in the recipe, following specific "Mix Rules" (e.g., Epic + Legendary ingredients have a chance to produce a Legendary meal).

---

## 3. Module Analysis

### 3.1 Backend (Server)
The backend is organized into controllers, services, and middleware.

- **`hunger.service.ts`**: The engine for hunger/task synchronization. It calculates real-time decay and manages the complex "pause/resume" logic for work orders using atomic DB updates. It also handles **Layer-based Hunger Multipliers** for mining (e.g., Deep/Core mining burns more Kcal without a Safety Helmet).
- **`workspace.controller.ts`**: Manages the lifecycle of work orders.
    - **FARM (Provider/Miner)**:
        - **Agraria**: Handles seed planting, 3x3 plot bonuses.
        - **Ferrum**: Handles mining expeditions with layer-specific drop rates (Iron, Copper, Steel, Stones, Gems) and queueing logic.
    - **COOK (Chef/Blacksmith)**:
        - **Chef**: Handles recipe execution, parallel cooking queues, and rarity determination for finished meals.
        - **Blacksmith**: Handles smelting recipes for ingots and uses "Alloy Mastery" to grant bonus outputs.

- **`equipmentEffects.service.ts`**: Aggregates all active buffs from the player's equipment to modify game variables (speed, cost, capacity).
- **`marketBot.service.ts`**: Simulates a living economy by having NPC bots buy player listings and sell "sink" materials (Gas, Flux, Oil) based on configurable intervals and price tolerances.
- **`gamePricing.service.ts`**: Provides a runtime-configurable system for balancing (NPC prices, EXP rates, drop rates) without requiring code changes.

### 3.2 Frontend (Client)
The frontend provides a real-time dashboard for managing the player's estate.

- **`gameStore.ts` (Zustand)**: The central state hub. It implements a **Hunger Interpolation** feature that simulates metabolism on the client side every second, ensuring the UI remains responsive and synchronized with the server's authoritative state.
- **`DashboardPage.tsx`**: The main interface, divided into functional panels:
    - **Profile/Stats**: Real-time hunger and level progress.
    - **Inventory**: 16-slot grid with rarity-aware sorting and equipment management.
    - **Workspace**: Interactive panels for starting and collecting farm/cook tasks.
    - **Market**: Interface for listing items and browsing player/bot trades.

---

## 4. City & Governance System

### 4.1 The Five Cities
The world of Freelance City is divided into five specialized districts, each with its own economy and primary/secondary occupations.
1. **Agraria**: Food & Agriculture (Farmer/Chef). The "breadbasket" of the world.
2. **Ferrum**: Industry & Tools (Miner/Blacksmith). Produces essential machinery.
3. **Voltara**: Energy & Fuel (Technician/Engineer). Powers the global supply chain.
4. **Textilis**: Textiles & Fashion (Weaver/Tailor). Provides gear and inventory expansion.
5. **Medico**: Science & Alchemy (Gatherer/Alchemist). Produces fertilizers and catalysts.

### 4.2 Governance: Citizen & Mayor
Each city is a self-governing entity with a democratic election system.
- **CITIZEN (Default Role)**: All players start as citizens of their chosen city. They have the right to vote for a Mayor once per election cycle.
- **MAYOR (Elected Role)**: The candidate with the most votes at the end of an election cycle (e.g., every 7 days) is promoted to Mayor.
    - **Tax Control**: Mayors can set the city's tax rates (Domestic, Export, Import) within specific bounds (0% to 12%).
    - **Treasury Management**: Taxes collected from trades flow into the city treasury, which contributes to the city's Tier level.

### 4.3 Voting Mechanics
- **Election Cycles**: Elections run on a fixed schedule (e.g., 7-day cycles).
- **Casting Votes**: Citizens can cast or change their vote for any candidate in their city at any time during the cycle.
- **Promotion**: When a new cycle starts, the system automatically recalculates the winner and updates the `UserRole` and `city_states` table.

---

## 5. Economic System & Marketplace

### 5.1 Global Marketplace
The marketplace is a cross-city platform where players from all locations can list and buy items. It supports:
- **Real-time Trading**: Instant listing and purchasing of resources.
- **Partial Buying**: Buyers can purchase a portion of a listed stack.
- **Market Bot**: NPC bots provide liquidity by buying player goods and selling "bottleneck" items to keep the economy moving.

### 5.2 Taxation System
Trades are subject to dynamic taxes based on the city relationship between the buyer and seller.
- **Domestic Tax**: Applied when both buyer and seller are in the same city. (e.g., Seller receives `Price - DomesticTax`).
- **Export Tax**: Paid by the **Seller** when selling to a player in a different city.
- **Import Tax**: Paid by the **Buyer** when purchasing from a player in a different city. (e.g., Buyer pays `Price + ImportTax`).
- **Revenue Flow**: All tax revenue is credited to the respective city's **Treasury**.

### 5.3 City Tiers & Bonuses
As a city's treasury grows, its **Tier** (1 to 10) increases, unlocking global bonuses for all its citizens:
- **Task Time Reduction**: Faster work orders.
- **NPC Shop Discounts**: Lower prices for seeds and ingredients.
- **Market Fee Discounts**: Lower effective tax rates.
- **Rare Drop Bonus**: Increased chance for Rare/Epic/Legendary items.

---

## 6. Economic Flow (Supply Chain)
1. **Input**: Buy Seeds/Tools from NPC Shop (Agraria/Ferrum).
2. **Production**: Start FARM/MINE tasks. Manage hunger by eating.
3. **Harvest**: Collect RAW materials (Chance for high rarity).
4. **Processing**: Use RAW materials + NPC Ingredients to COOK meals or SMELT ingots.
5. **Output**: Use high-tier meals for "Satiety Buffs" or sell products to the Marketplace.
6. **Trade**: Market Bot or players buy your goods, generating tax revenue for your city and profit for your expansion.

---

## 7. Summary of Key Files
| File | Responsibility |
| :--- | :--- |
| `prisma/schema.prisma` | Database schema for users, items, tasks, and market. |
| `game.config.ts` | Core game constants (Time scale, EXP formulas, Decay rates). |
| `hunger.service.ts` | Authority on time-based hunger and task completion. |
| `workspace.controller.ts` | Logic for starting/cancelling/collecting FARM and COOK tasks. |
| `gameStore.ts` | Frontend state management and real-time hunger simulation. |
| `marketBot.service.ts` | NPC-driven market simulation and liquidity. |
