# Project Name: Freelance City (Survival Phase)

## 1. Game Concept
A web-based management simulation game focusing on a player-driven economy. The core loop revolves around survival (hunger management), resource production, and trading between interdependent professions.

**Platform:** Web Browser (Desktop/Mobile)
**Visual Style:** Modern Dashboard / Trello-like Kanban Board / Dark Mode UI

---

## 2. Core Mechanics

### 2.1 Time & Physics
* **Time Scale:** 1 Game Day = 3 Real-time Hours (180 Minutes).
* **Calorie Burn:**
    * Average Requirement: 2,400 Kcal / Game Day.
    * Real-time Decay: **~13.33 Kcal per minute**.

### 2.2 Player Stats
* **Money (Credits):** Currency for trading.
* **Hunger (Kcal):** Max 2,400. Critical impact on work efficiency.
* **Inventory:** Fixed **8 Slots**. (Items stack based on config).

### 2.3 Professions (Classes)
Players must choose one role upon first login. Dependencies enforce trading.

#### **A. Provider (Supplier)**
* **Role:** Farm animals and grow crops.
* **Actions:** Buy Seeds/Livestock -> Wait for Growth -> Harvest/Slaughter.
* **Products:** Raw Meat (Pork, Beef, Chicken), Vegetables.
* **Constraint:** Cannot cook high-tier meals. Must buy food from Chefs to survive efficiently.

#### **B. Chef (Crafter)**
* **Role:** Turn raw ingredients into edible meals.
* **Actions:** Buy Ingredients -> Cook -> Sell Meals.
* **Products:** Cooked Meals (Steak, Salad).
* **Buffs:** Meals provide Kcal + "Satiety Buff" (Slows down hunger decay).

---

## 3. Economy & Logic

### 3.1 Hunger Penalty System
Hunger level directly affects action duration (Work Efficiency).

| Hunger % | State | Duration Multiplier | Effect |
| :--- | :--- | :--- | :--- |
| **80-100%** | Fit | **1.0x** | Normal Speed |
| **40-79%** | Normal | **1.2x** | Slightly Slower |
| **20-39%** | Hungry | **1.5x** | Slower |
| **0-19%** | Starving | **2.5x** | Very Slow (Risk of failure) |

### 3.2 Food Recipes (Examples)
1.  **Chicken Salad:**
    * Ingredients: 1 Chicken Meat + 2 Veg.
    * Effect: +80 Kcal.
    * Buff: Hunger decay slowed by 5%.
2.  **Beef Steak:**
    * Ingredients: 1 Beef Meat + 1 Veg + 1 Salt.
    * Effect: +360 Kcal.
    * Buff: Hunger decay slowed by 15%.

---

## 4. Technical Stack
* **Frontend:** React (Vite), TypeScript, Tailwind CSS, Framer Motion (Animations).
* **Backend:** Node.js (Express), TypeScript.
* **Database:** MySQL.
* **Communication:** REST API (Phase 1), Socket.io (Phase 2).

## 5. UI Structure (Dashboard)
* **Column 1:** Profile & Stats (Real-time Hunger Bar).
* **Column 2:** Inventory (8 Grid Slots).
* **Column 3:** Workspace (Farm / Kitchen).
* **Column 4:** Market (Buy/Sell Orders).