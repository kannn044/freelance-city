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

### 2.4 Equipment System (New)
* เพิ่ม Item Type ใหม่: **EQUIPMENT**
* จำนวนสล็อตสวมใส่: **6 Slots**
    * `HEAD`, `UPPER_BODY`, `LOWER_BODY`, `ARM`, `GLOVE`, `SHOE`
* แนวคิด: เพิ่มความแตกต่างเชิงอาชีพผ่าน Passive/Stat เฉพาะทาง

#### 1) 🧢 Headgear — Focus & Management
* **Provider: Sun Hat**
    * Passive: ลดผลกระทบ Hunger Penalty ลง 1 ขั้น
* **Chef: Toque Blanche**
    * Passive: โอกาส 10% ที่การทำอาหารจะไม่เสียวัตถุดิบรอง

#### 2) 👕 Top — Capacity & Endurance
* **Provider: Field Shirt**
    * Stat: เพิ่ม Max Hunger +200 ถึง +500 Kcal
* **Chef: Apron**
    * Stat: เพิ่ม Max Hunger +150 Kcal และเพิ่มผล Satiety Buff +10%

#### 3) 👖 Bottom — Storage & Logistics
* **Provider: Cargo Pants**
    * Passive: เพิ่ม Stack ของผลผลิต Raw Meat / Veg ต่อช่อง
* **Chef: Slack Pants**
    * Passive: เพิ่ม Stack ของ Ingredient ต่อช่อง

#### 4) 💪 Armband — Strength & Speed
* **Provider: Sweatband**
    * Stat: ลดเวลา Harvest/Slaughter ลง 5-15%
* **Chef: Wrist Support**
    * Stat: ลดเวลา Cook ลง 5-15%

#### 5) 🧤 Gloves — Dexterity & Luck
* **Provider: Work Gloves**
    * Passive: โอกาส 5-10% ได้ผลผลิต x2 (Double Yield)
* **Chef: Latex Gloves**
    * Passive: โอกาส 5-10% ทำอาหารระดับ Gourmet

#### 6) 👟 Shoes — Metabolism & Conservation
* **Provider: Mud Boots**
    * Stat: ลด Real-time Hunger Decay ลง 1-2 Kcal/นาที
* **Chef: Anti-Slip Shoes**
    * Stat: ระหว่าง Cooking ลดอัตราการเผาผลาญความหิวลง 20%

#### 💎 Set Bonus (Idea)
* **The Great Provider (ครบ 6 ชิ้น)**: เร่งการเติบโตพืช/สัตว์ +10%
* **The Master Chef (ครบ 6 ชิ้น)**: เพิ่มราคาขายอาหาร +5% หรือมองเห็น Demand ล่วงหน้า

#### ⚖️ Balance Note
* แนะนำระบบ Tier: `Common`, `Rare`, `Legendary`
* Tier ที่สูงขึ้นจะเพิ่ม % ของ Stat/Passive ให้มากขึ้น

### 2.5 Equipment Box (Gacha)
* ของสวมใส่ **ไม่ขายตรงใน NPC Shop**
* ผู้เล่นซื้อ **Equipment Box** แล้วเปิดสุ่ม
* 1 กล่อง = 1 ไอเทม EQUIPMENT
* สามารถสุ่มได้ของที่ไม่ตรงอาชีพตัวเอง

**สูตรสุ่ม**
* `Final Chance(ชิ้นส่วน+อาชีพ) = Role Bias × Slot Weight`

**Role Bias (ตามอาชีพหลักผู้เล่น)**
* ผู้เล่นสาย Provider: Provider 70% / Chef 30%
* ผู้เล่นสาย Chef: Provider 30% / Chef 70%
* ผู้เล่นยังไม่เลือกอาชีพ: Provider 50% / Chef 50%

**Slot Weight (รวม 100%)**
* Head 14%
* Upper Body 18%
* Lower Body 18%
* Arm 16%
* Glove 16%
* Shoe 18%

ตัวอย่าง (ผู้เล่นสาย Provider):
* Provider Head = 70% × 14% = **9.8%**
* Chef Head = 30% × 14% = **4.2%**
* Provider Upper Body = 70% × 18% = **12.6%**
* Chef Upper Body = 30% × 18% = **5.4%**

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