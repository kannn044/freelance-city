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

### 2.6 Chef Skill Tree (Proposal - Pre-Implementation)

> สถานะ: แนวคิดสำหรับรีวิวก่อนลงโค้ดจริง

แนวคิดรวม:
* ใช้รูปแบบเดียวกับ Provider: 3 สาย, สูงสุด Lv.4, ใช้แต้มจาก `chef_level`
* จุดประสงค์: ทำให้ Chef มีความลึกด้าน **ความเร็ว / ความคุ้มวัตถุดิบ / ความสามารถขายออกในตลาด**
* ต้องไม่ทับกับ Equipment ทั้งหมด แต่ควรเสริมกันได้

#### สาย A: PREP_MASTER (Speed / Throughput)
โฟกัส: ทำอาหารเร็วขึ้นและขยายจำนวนคิวพร้อมกัน

* **Lv1:** ลดเวลา COOK 5%
* **Lv2:** เพิ่มคิว COOK พร้อมกัน +1 (จาก 1 → 2)
* **Lv3:** ลดเวลา COOK เพิ่มอีก 5% (รวม 10%)
* **Lv4:** เพิ่มคิว COOK พร้อมกัน +1 (จาก 2 → 3)

#### สาย B: KITCHEN_ECONOMY (Ingredient Efficiency)
โฟกัส: ประหยัดต้นทุนวัตถุดิบ

* **Lv1:** โอกาสไม่ใช้วัตถุดิบรอง +6%
* **Lv2:** โอกาสไม่ใช้วัตถุดิบรอง +6% (รวม 12%)
* **Lv3:** โอกาสไม่ใช้วัตถุดิบหลัก +5%
* **Lv4:** โอกาสไม่ใช้วัตถุดิบหลัก +5% (รวม 10%)

#### สาย C: MARKET_INTEL (Liquidity / Sell-Through)
โฟกัส: ทำให้ของขายออกง่ายขึ้น (แทน Gourmet quality ที่ไม่ชัดเจนเมื่อผู้เล่นตั้งราคาเอง)

* **Lv1:** เพิ่มความน่าจะเป็นที่บอทเลือกพิจารณา listing ของผู้เล่น
* **Lv2:** ขยายเพดานราคาที่ยอมรับได้ของบอท (anti-overprice ผ่อนคลายเล็กน้อย)
* **Lv3:** เพิ่มอายุ listing ที่ยังคงความน่าสนใจต่อบอท
* **Lv4:** เพิ่มโอกาสขายออกโดยรวมในแต่ละช่วงเวลา (ผ่านน้ำหนักการสุ่ม)

---

### 2.7 Chef Task Logic เมื่อมี Skill (Proposal)

#### ตอนเริ่มงาน COOK
1. ตรวจคิวพร้อมกันจากสาย `PREP_MASTER`
    * Base 1, Lv2 = 2, Lv4 = 3
2. คำนวณเวลาเสร็จงาน
    * `finalCookTime = baseCookTime × hungerTierMultiplier × (1 - equipCookReduction) × (1 - skillCookReduction)`
3. คำนวณการหักวัตถุดิบ
    * ใช้โอกาส save จาก `equipment + KITCHEN_ECONOMY`
    * ควรมีเพดานรวม เช่น 70% เพื่อกันระบบแตก

#### ตอนเก็บงาน COOK (Collect)
* ใช้ผลลัพธ์ตามที่ถูกกำหนดจากตอน start (กัน exploit การ reroll)
* เพิ่ม/ลดผลตอบแทนตามระบบที่ออกแบบ (เช่น save/cost efficiency ที่บันทึกไว้)

#### ผลกระทบแบบ Real-time หลังอัปสกิล
* สาย PREP_MASTER (ลดเวลา): มีผลกับงาน COOK ที่กำลังรันทันที โดยปรับ `remaining time`
* สาย KITCHEN_ECONOMY: มีผลกับงานใหม่ที่เริ่มหลังอัป (เพราะหักวัตถุดิบตอน start)
* สาย MARKET_INTEL: มีผลทันทีที่ตลาด/บอทรอบถัดไปโดยไม่กระทบของผู้เล่นย้อนหลัง

---

### 2.8 Balance / Safety Notes (Chef Skills)

* กำหนด soft cap ของโบนัสรวมที่มาจาก Skill + Equipment
* Skill ฝั่งตลาดควรเป็น "weight boost" ไม่ใช่ guaranteed sale
* หลีกเลี่ยงการทำให้ Chef overtake economy เร็วเกิน (โดยเฉพาะช่วง early game)
* ทุกค่าควรย้ายไป config เพื่อปรับ balancing ได้โดยไม่ต้องแก้ logic หลัก

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

---

## 6. สรุปสถานะระบบปัจจุบัน (อัปเดตล่าสุด)

ส่วนนี้สรุปจากการคุยและการพัฒนาล่าสุด เพื่อใช้เป็นฐานต่อยอด

### 6.1 Gameplay Runtime Config (ปรับบาลานซ์ได้แบบไม่กระทบผู้เล่นย้อนหลัง)
มีระบบตั้งค่าเกมแบบ runtime ผ่านฐานข้อมูล/แอดมิน เช่น
* ราคาสินค้า/สูตรคำนวณตลาด
* อัตรา decay แยกตามงาน (`FARM`, `COOK`)
* ตัวคูณเวลา task แยกอาชีพ
* ตัวคูณ EXP
* อัตราดรอป rarity

### 6.2 Hunger & Task Time Logic
* หิวลดตามงานที่กำลังทำ (task-driven)
* เมื่อ Kcal = 0 งานจะหยุดคืบหน้า (pause) และกลับมาเดินต่อเมื่อมี Kcal
* แก้ race-condition ตอน refresh แล้วเวลา task เพี้ยนแล้ว

### 6.3 Inventory / Equipment
* Inventory 8 ช่อง + stack แยกตาม rarity สำหรับวัตถุดิบบางชนิด
* Equipment 6 ช่อง พร้อม rarity และเอฟเฟกต์เฉพาะทาง
* เพิ่มระบบทิ้งของแบบ Drag & Drop ลงถังขยะพร้อม confirm

### 6.4 Work Orders
* Provider/Farm: ระบบ plot 3x3 + bonus เมื่อครบแปลง
* Chef/Cook: ระบบคิวต่อเนื่อง (queue)
* เก็บงานได้เดี่ยวหรือเก็บงานที่เสร็จพร้อมกัน
* **ยกเลิกงาน active ได้** และคืนวัตถุดิบ โดยเช็คพื้นที่ inventory ก่อน

### 6.5 Rarity Economy
* วัตถุดิบ RAW สำคัญมี tier/rarity
* การทำอาหารมีผล rarity ตามส่วนผสม
* Meal rarity ส่งผลต่อ buff
* Market รองรับการแสดง/ซื้อขายโดยคง rarity

---

## 7. ทิศทางเกมที่ตกลงล่าสุด: “ผู้เล่น 1 คนเล่นได้หลายอาชีพ”

### 7.1 หลักการ
* ผู้เล่นเป็นลักษณะ “ผู้บริหาร” (Manager/Owner)
* ปลดล็อกอาชีพถัดไปตามเลเวล
* ผู้เล่น 1 คนสามารถเล่นจบเองได้ (solo viable)

### 7.2 โจทย์สำคัญ
แม้จะจบเองได้ แต่ต้องออกแบบให้ **การพึ่งพาผู้เล่นคนอื่นคุ้มกว่า/เร็วกว่า/เสถียรกว่า**

---

## 8. Ecosystem เป้าหมาย (Supply Chain แบบงูกินหาง)

### 8.1 วงจรหลัก 4 วง
1. **Food Loop**: ต้นน้ำ -> วัตถุดิบ -> อาหาร -> บัฟ -> เพิ่มประสิทธิภาพการผลิต
2. **Gear Loop**: วัตถุดิบพิเศษ -> คราฟต์/ซ่อมอุปกรณ์ -> เพิ่มผลผลิต -> ใช้ทรัพยากรมากขึ้น
3. **Logistics Loop**: แพ็ก/ขนส่ง/ค่าธรรมเนียม -> ทำให้การค้าเป็นระบบต้นทุนจริง
4. **Recycling Loop**: ของเหลือ/เศษ/ของเสีย -> รีไซเคิล -> ย้อนกลับต้นน้ำ

### 8.2 อาชีพในภาพรวมระบบเศรษฐกิจ (แผนระยะกลาง-ยาว)
อาชีพที่มีแล้ว:
* Provider (ต้นน้ำ)
* Chef (ปลายน้ำอาหาร)

อาชีพที่แนะนำเพิ่มทีละเฟส:
* Processor (แปรรูป RAW -> INGREDIENT)
* Crafter (ผลิต/ซ่อมอุปกรณ์)
* Trader (เชี่ยวชาญตลาด/สัญญาซื้อขาย)

> หมายเหตุ: ผู้เล่นคนเดียวปลดครบได้ แต่หาก specialize จะได้ผลตอบแทนสูงกว่าอย่างมีนัยสำคัญ

---

## 9. วิธีทำให้ “เล่นคนเดียวได้” แต่ “ต้องพึ่งกันเพื่อไปไกลสุด”

### 9.1 Capacity Constraint
จำกัดกำลังการผลิต/จำนวนงานพร้อมกัน/เวลาบริหารต่อวัน
* ทำได้ทุกอาชีพ แต่ทำได้ไม่สุดทุกสายพร้อมกัน

### 9.2 Specialization Bonus
ให้โบนัสแรงเมื่อโฟกัสสายใดสายหนึ่ง (yield, quality, speed, cost)
* คนที่เน้นเฉพาะทางจะผลิตถูกกว่า/ไวกว่า

### 9.3 Chain Loss / Conversion Loss
ทำครบห่วงโซ่เองได้ แต่มี loss บางจุด (เวลา/ต้นทุน/ประสิทธิภาพ)
* ซื้อจากผู้เล่นสายตรงคุ้มกว่าในหลายเคส

### 9.4 Contract Economy (B2B)
ระบบสัญญาซื้อขายระยะยาวระหว่างผู้เล่น
* ลดความเสี่ยง supply ขาด
* เพิ่มความผูกพันระหว่างผู้เล่นในระบบ

### 9.5 Public Demand (เมืองเป็น sink หลัก)
เมืองมีความต้องการสินค้าเป็นรอบเวลา
* ช่วยดูดซับของล้นตลาด
* ทำให้ราคามีแรงเคลื่อนแบบเศรษฐกิจจริง

### 9.6 Logistics Friction
มีต้นทุนขนส่ง/แพ็ก/คลัง
* ป้องกันการทำทุกอย่างคนเดียวแล้วคุ้มที่สุดเสมอ

### 9.7 Knowledge/Blueprint Economy
สูตรขั้นสูงหรือแบบแปลนบางส่วนต้องสะสม/แลกเปลี่ยน
* เพิ่มแรงจูงใจในการร่วมมือและค้าข้ามสาย

---

## 10. Goal ของเกม (กำหนดชัดเป็น 3 ชั้น)

### 10.1 Personal Goal
* ปลดล็อกครบทุกอาชีพ
* ทำธุรกิจครบห่วงโซ่ด้วยตัวเองได้

### 10.2 Economic Goal
* สร้างกิจการที่กำไรต่อวันเติบโตต่อเนื่อง
* บริหารต้นทุนซัพพลายเชนและ inventory ให้มีประสิทธิภาพ

### 10.3 City / Endgame Goal
* ร่วมกันส่งมอบสินค้าเพื่อพัฒนาเมืองระดับสูง
* ปลดล็อกโปรเจกต์เมือง (district/building) ที่ส่งผลทั้งเซิร์ฟเวอร์

---

## 11. KPI Design Target (เพื่อวัดว่า ecosystem หมุนจริง)

* **D1 / D7 Retention** สูงขึ้นหลังมีระบบสัญญาและ demand เมือง
* **Market Participation Rate**: สัดส่วนผู้เล่นที่ซื้อ/ขายต่อวัน
* **Cross-Profession Dependency Rate**: สัดส่วนการใช้ของที่มาจากผู้เล่นอื่น
* **Contract Fulfillment Rate**: อัตราส่งมอบตามสัญญา
* **Economic Stability**: ความผันผวนราคาที่ไม่แตก (ไม่เฟ้อ/ไม่พัง)

---

## 12. Roadmap แนะนำ (ไม่รวม Event ตามที่ตกลง)

### Phase A (ทำก่อน)
1. วาง `Capacity + Specialization Bonus`
2. เพิ่ม `Processor/Crafter` ขั้นพื้นฐาน
3. ทำ `Public Demand` เป็น sink กลาง

### Phase B
1. เพิ่ม `Contract Economy` ระหว่างผู้เล่น
2. เพิ่ม `Logistics Cost` และระบบแพ็กสินค้า
3. ปรับสูตร dynamic tax/floor/ceiling

### Phase C (Endgame Loop)
1. เมกะโปรเจกต์เมือง
2. ระบบ contribution season
3. รางวัลเชิงสถานะ (badge/title/utility)

---

## 13. Design Principle สรุปสุดท้าย

> ผู้เล่น 1 คนต้อง “เล่นจบได้” แต่ระบบต้องทำให้ “พึ่งพากันแล้วดีกว่าอย่างชัดเจน”

สูตรเป้าหมายเชิงบาลานซ์:
* Solo baseline = 1.0x
* Specialist + Market = 1.8x - 2.5x
* Supply-chain network = 2.5x - 3.5x

ถ้าระบบทำให้ตัวเลขต่างชั้นได้จริง เกมจะเกิดวงจรเศรษฐกิจที่หมุนวนเองและผู้เล่นกลับมาเล่นต่อเนื่อง

---

## 14. Code Snapshot (อ้างอิงโค้ดล่าสุดแบบละเอียด)

> อัปเดตจากโค้ดล่าสุด ณ วันที่จัดทำเอกสารนี้ (Server + Client + Prisma)
> เน้น “สิ่งที่ทำงานอยู่จริง” แยกจากแนวคิดที่ยังไม่ผูก logic

### 14.1 Runtime Architecture

#### Backend
* Node.js + Express + TypeScript
* Prisma + MySQL
* JWT auth (`/auth/*`)
* CORS จากค่าคงที่ + env (`CORS_ORIGINS`)
* Health endpoint: `GET /health`
* Market bot service เริ่มอัตโนมัติเมื่อ server start

#### Frontend
* React + Vite + TypeScript
* Zustand state (`authStore`, `gameStore`)
* Framer Motion สำหรับ animation
* Dashboard แบ่ง panel หลัก: Profile, Inventory, Workspace, Market, Active Orders

---

### 14.2 Core Game Constants (ใช้งานจริง)

จาก `server/src/config/game.config.ts`

* `GAME_DAY_MINUTES = 180`
* `MAX_HUNGER = 2400`
* Passive decay พื้นฐาน: `HUNGER_DECAY_PER_MIN = 2400/180 ≈ 13.33`
* Task decay (runtime-overridable)
    * `FARM_PER_PLOT = 0.01 kcal/sec`
    * `COOK_PER_MENU = 0.25 kcal/sec`
* Inventory slot เริ่มต้น: `8`

#### Hunger Tiers
* Fit (80-100%): x1.0
* Normal (40-79%): x1.2
* Hungry (20-39%): x1.5
* Starving (0-19%): x2.5

#### Occupation Leveling
* Max level = 50
* Unlock second occupation ที่เลเวลอาชีพหลัก = 5
* EXP threshold: `level^2 * 100`

---

### 14.3 Item / Recipe / Equipment Seed Data (ฐานเริ่มต้น)

จาก `server/prisma/seed.ts`

#### Seed (Provider ซื้อได้)
* Chicken Egg: buy 50, grow 10m
* Beef Calf: buy 120, grow 20m
* Vegetable Seed: buy 30, grow 8m

#### Raw Outputs
* Chicken Meat (sell 80)
* Beef Meat (sell 180)
* Vegetable (sell 40)

#### Ingredient
* Salt (buy 20)

#### Meals
* Chicken Salad: kcal 80, buff 5%, 30m
* Beef Steak: kcal 360, buff 15%, 60m

#### Recipes
* Chicken Salad = Chicken Meat 1 + Vegetable 2 (unlock 250)
* Beef Steak = Beef Meat 1 + Vegetable 1 + Salt 1 (unlock 600)

#### Equipment Catalog (12 ชิ้น)
* Provider/Chef ครบ 6 slot: HEAD/UPPER_BODY/LOWER_BODY/ARM/GLOVE/SHOE
* ใช้ `effect_key` + `effect_value(_2)` เป็นระบบ modifier

---

### 14.4 Rarity System (ใช้งานจริง)

#### ประเภท rarity
* `NORMAL`, `RARE`, `EPIC`, `LEGENDARY`

#### Harvest rarity (weight)
* NORMAL 80
* RARE 28
* EPIC 1.9
* LEGENDARY 0.1

#### Equipment rarity (probability)
* NORMAL 0.95
* RARE 0.045
* EPIC 0.0045
* LEGENDARY 0.0005

#### Equipment buff multiplier
* NORMAL 0.25
* RARE 0.5
* EPIC 0.75
* LEGENDARY 1.0

#### Food rarity buff multiplier
* NORMAL 1.0
* RARE 1.2
* EPIC 1.5
* LEGENDARY 2.0

#### Cooking rarity mix rules
* ใช้ pair ของ ingredient rarity ที่สูงสุด 2 ตัว
* มี 10 cases ครบคู่แบบไม่เรียงลำดับ
* คำนวณแบบ weighted roll จาก `COOK_INGREDIENT_RARITY_MIX_RULES`

---

### 14.5 Runtime Config System (DB-backed)

จาก `server/src/services/gamePricing.service.ts`

ใช้ตาราง `game_settings` (สร้างอัตโนมัติถ้าไม่มี)

#### กลุ่ม config ที่ปรับได้
1. Pricing
     * `npcShopMultiplier` (0.1 - 10)
     * `equipmentBoxPrice` (1 - 1,000,000)
2. Task Decay
     * `farmPerPlot` (0 - 10)
     * `cookPerMenu` (0 - 10)
3. Task Time
     * `providerTaskTimeMultiplier` (0.1 - 10)
     * `chefTaskTimeMultiplier` (0.1 - 10)
4. EXP
     * provider/chef work market multipliers (0 - 10)
5. Rarity Rates
     * harvest rarity weights
     * equipment rarity probabilities

#### Admin guard
* ใช้ header `x-admin-key` เทียบ `ADMIN_SECRET`

---

### 14.6 Auth / Role / Progression

จาก `auth.controller.ts`

* Register สร้าง user + inventory 8 slot
* Login sync hunger ก่อนตอบ
* Select Class (`PROVIDER`/`CHEF`) ตั้ง role และ set level อาชีพนั้นเป็น 1
* Unlock second occupation เมื่อ primary level ถึงเกณฑ์
* `/auth/me` เรียก `syncHunger` ทุกครั้ง

ผู้เล่น 1 คนมีหลายอาชีพได้จริงผ่าน `provider_level` และ `chef_level`

---

### 14.7 Hunger / Pause / Resume Logic (สำคัญ)

จาก `hunger.service.ts`

#### หลักการปัจจุบัน
* Sync hunger ตามช่วงเวลาจริงระหว่าง `hunger_updated_at -> now`
* Decay มาจากงาน active เท่านั้น
* FARM decay คิดเป็น “จำนวน plot active” (ceil(task count / 9) ต่อ seed type)
* COOK decay คิดเป็นจำนวน menu active

#### บัฟ/อุปกรณ์ที่มีผล
* Satiety buff ลด decay (ช่วงเวลาบัฟยังไม่หมด)
* `cook_state_hunger_decay_reduction_pct` ลดเฉพาะส่วน COOK decay
* `hunger_decay_reduction_per_min` หักแบบ flat ตามนาทีจริง

#### Pause เมื่อ hunger หมด
* ถ้า hunger <= 0: เลื่อน timeline งานค้าง (`started_at`, `completes_at`) ไปข้างหน้าเท่าช่วง pause
* มี atomic update ป้องกัน race condition ตอน sync ซ้ำ

---

### 14.8 Inventory / Equipment Logic

จาก `inventory.controller.ts`

#### Inventory
* มี endpoint ดูช่อง, organize combine/sort A-Z, discard item
* Organize รองรับ rarity-aware stacking
* Discard รองรับ quantity และล้าง rarity เมื่อช่องว่าง

#### Equipment
* Equip/Unequip ผ่าน `user_equipments`
* สลับของระหว่าง inventory กับ equipment slot แบบ transaction
* เก็บ rarity ของ item ที่ equip (`item_rarity`)

#### Eat
* กินได้เฉพาะ item ที่มี kcal > 0
* ถ้าเป็น MEAL ใช้ rarity คูณ `buff_pct`
* เรียก `applyMealEffect` เพื่อ update hunger + buff

---

### 14.9 Equipment Effects Runtime

จาก `equipmentEffects.service.ts`

รองรับ effect keys หลัก:
* hunger_penalty_tier_reduction
* cook_secondary_ingredient_save_chance
* max_hunger_bonus
* max_hunger_and_satiety_bonus
* raw_stack_bonus
* ingredient_stack_bonus
* farm_time_reduction_pct
* cook_time_reduction_pct
* farm_double_yield_chance
* gourmet_chance
* hunger_decay_reduction_per_min
* cook_state_hunger_decay_reduction_pct

มี clamp caps ในระบบเพื่อกันค่าหลุดสมดุล

---

### 14.10 Workspace Logic (FARM / COOK / COLLECT / CANCEL)

จาก `workspace.controller.ts`

#### FARM start
* ต้องมี Provider
* ตรวจ seed และจำนวน
* ผูก branch skill ตาม seed (`VEGETABLE`, `CHICKEN`, `BEEF`)
* จำกัด plot capacity ตาม skill
* เวลา task = grow_mins × hunger multiplier × skill reduction × equipment reduction × runtime multiplier
* เมื่อครบ 9 งานใน plot เดียวกัน จะเฉลี่ยเวลาและลดอีก 10%

#### COOK start
* ต้องมี Chef และ recipe unlock แล้ว
* รองรับ 2 โหมด:
    1) auto consume
    2) selectedIngredients (เลือก slot+qty)
* ใช้ equipment + chef skill economy ในการคำนวณโอกาส save ingredient
* เวลา cook = base × hunger × equipmentCook × chefPrep × runtime multiplier
* คิว COOK เป็น “parallel slots” ตาม `PREP_MASTER` (1/2/3)
* คำนวณ rarity output meal ตาม ingredient pair (top 2 rarity consumed)

#### Collect
* เก็บรายงานเดี่ยวและเก็บงานพร้อมกัน (collect-ready)
* ตรวจ ready โดยมี grace 5 วินาที
* ตรวจพื้นที่ inventory ก่อนรับผลผลิต
* ได้ EXP ตาม runtime exp multipliers

#### Cancel active order
* ยกเลิกได้เฉพาะงานยังไม่ ready
* FARM คืน seed ตามจำนวน
* COOK คืน ingredient ตามสูตร
* คืนไม่ได้ถ้า inventory ไม่พอ
* หลัง cancel COOK มีการ reschedule queue ใหม่ตาม parallel slots ของ chef skill

---

### 14.11 Skills System (Provider + Chef)

จาก `skills.controller.ts` + `game.config.ts`

#### Provider Skill
* Branch: `VEGETABLE`, `CHICKEN`, `BEEF`
* point budget = provider_level - spent
* max level branch = 4
* ผลจริง:
    * ลดเวลา farm ทันทีบนงาน active (เมื่อได้ Lv1/Lv3)
    * เพิ่ม plot capacity (Lv2/Lv4)

#### Chef Skill
* Branch: `PREP_MASTER`, `KITCHEN_ECONOMY`, `MARKET_INTEL`
* point budget = chef_level - spent
* max level branch = 4
* มีการ ensure columns ใน `users` อัตโนมัติ:
    * `chef_skill_prep`, `chef_skill_economy`, `chef_skill_market`

##### ผลจริงที่ผูก gameplay แล้ว
* `PREP_MASTER`
    * ลดเวลา cook (Lv1/Lv3)
    * เพิ่ม parallel cook slots (Lv2/Lv4)
    * apply กับงานค้างทันทีเมื่ออัป
* `KITCHEN_ECONOMY`
    * เพิ่มโอกาสประหยัดวัตถุดิบรอง (Lv1/Lv2)
    * เพิ่มโอกาสประหยัดวัตถุดิบหลัก (Lv3/Lv4)
    * ใช้จริงตอน start cook ทั้ง selected + auto consume

##### สถานะ `MARKET_INTEL`
* มี UI/point/upgrade/เก็บเลเวลแล้ว
* ข้อความ effect มีใน skill tree
* **ยังไม่ผูก logic ใน market bot ณ snapshot นี้**

---

### 14.12 Shop System

จาก `shop.controller.ts`

* `/game/shop` แสดงของตามอาชีพที่ปลดล็อก
    * Provider ได้ SEED
    * Chef ได้ INGREDIENT
* ซื้อของจาก NPC shop คิดราคา effective ตาม runtime multiplier
* ตรวจเงิน + ตรวจ inventory capacity ก่อนหักเงิน

#### Equipment Box
* เปิดกล่องสุ่ม role bias ตาม role ผู้เล่น
* slot weights: HEAD 14 / UPPER 18 / LOWER 18 / ARM 16 / GLOVE 16 / SHOE 18
* rarity ตาม runtime equipment rates
* ของที่สุ่มได้เข้ากระเป๋าแบบ rarity-aware

#### Recipe Shop
* `/game/recipes` = recipes ที่ unlock แล้ว
* `/game/shop/recipes` = recipes ที่ยังล็อก
* `/game/shop/recipes/buy` ซื้อ unlock recipe

---

### 14.13 Market System

จาก `market.controller.ts`

* Listing ACTIVE/SOLD/CANCELLED
* รองรับ partial buy
* เก็บ sales history แยกสำหรับ seller
* rarity ของ listing ถูกเก็บใน `market_listings.equipment_rarity`
    * มี ensure column อัตโนมัติ
* ซื้อ/ยกเลิก listing ตรวจ inventory capacity ก่อนเสมอ

#### EXP ใน market
* ตอนสร้าง listing ปัจจุบัน `expGained = 0` (ไม่ให้ EXP ตอนลงขาย)

---

### 14.14 Market Bot

จาก `marketBot.service.ts`

* ทำงานแบบ tick (ค่า default 30 วินาที)
* มีโอกาสซื้อในแต่ละ tick (`buyChancePerTick`)
* จำกัดจำนวน listing/จำนวนชิ้นต่อ tick
* ป้องกัน overprice ด้วย `maxUnitPriceRatio` เทียบ reference price
* รองรับ partial buy และบันทึก SOLD history
* ปรับ config runtime ได้จาก API

---

### 14.15 API Surface (ใช้งานจริง)

#### Auth
* `POST /auth/register`
* `POST /auth/login`
* `POST /auth/select-class`
* `POST /auth/unlock-occupation`
* `GET /auth/me`

#### Game - Inventory / Equipment
* `GET /game/inventory`
* `POST /game/inventory/organize`
* `POST /game/inventory/discard`
* `POST /game/eat/:slotId`
* `POST /game/equipment/equip`
* `POST /game/equipment/unequip`

#### Game - Workspace
* `GET /game/workspace`
* `POST /game/workspace/start`
* `POST /game/workspace/collect/:orderId`
* `POST /game/workspace/collect-ready`
* `POST /game/workspace/cancel/:orderId`

#### Game - Skills
* `GET /game/skills/provider`
* `POST /game/skills/provider/upgrade`
* `GET /game/skills/chef`
* `POST /game/skills/chef/upgrade`

#### Game - Market
* `GET /game/market`
* `GET /game/market/sales-history`
* `POST /game/market/sell`
* `POST /game/market/buy/:listingId`
* `POST /game/market/cancel/:listingId`
* `GET /game/market/bot/config`
* `POST /game/market/bot/config`
* `POST /game/market/bot/tick`

#### Game - Shop / Recipes
* `GET /game/shop`
* `POST /game/shop/buy`
* `GET /game/shop/equipment-box`
* `POST /game/shop/equipment-box/open`
* `GET /game/shop/recipes`
* `POST /game/shop/recipes/buy`
* `GET /game/recipes`

#### Game - Runtime Config
* Public: `GET /game/runtime-config`
* Admin:
    * `GET /game/admin/pricing`
    * `POST /game/admin/pricing`
    * `GET /game/admin/runtime-config`
    * `POST /game/admin/runtime-config`

---

### 14.16 Client UX/State ที่เชื่อมกับระบบล่าสุด

#### Dashboard
* มี occupation cards + unlock second occupation
* มี Provider skill modal และ Chef skill modal

#### Inventory Panel
* แสดง equipment slots + rarity colors
* organize combine/sort
* click-to-eat / click-to-equip พร้อม confirm
* drag & drop ลงถังขยะเพื่อ discard พร้อม confirm

#### Workspace Panel
* Farm จาก seed slots
* Cook modal เลือก ingredient slot/qty
* แสดง predicted rarity outcomes แบบ realtime

#### Active Orders Panel
* Provider แสดงเป็น plot 3x3 ตามชนิด seed
* Chef แสดงเป็น card + state (Queued/Paused/Ready)
* Collect รายการเดียว / Collect all ready
* Cancel active order ได้จาก UI ทั้ง provider และ chef

#### Market Panel
* แสดง listing/sales history พร้อม rarity
* รองรับซื้อบางส่วน (partial quantity)

---

### 14.17 Data Model Notes (จาก Prisma + runtime migration)

#### Prisma models หลัก
* `User`, `Item`, `Recipe`, `RecipeIngredient`, `UserRecipeUnlock`
* `InventorySlot`, `UserEquipment`
* `WorkOrder`, `MarketListing`

#### คอลัมน์ที่ถูก ensure runtime
* `work_orders.output_rarity`
* `market_listings.equipment_rarity`
* `users.chef_skill_prep`
* `users.chef_skill_economy`
* `users.chef_skill_market`

> หมายเหตุ: โค้ดเลือกใช้แนว ensure-column ระหว่าง runtime เพื่อไม่บล็อกการรันกรณี migration ยังไม่ครบ

---

### 14.18 สรุปสถานะปัจจุบัน (Implementation Truth)

#### Done และใช้งานจริง
* Multi-occupation progression
* Hunger sync + pause/resume timeline
* Inventory organize/discard
* Equipment + rarity scaling effects
* Provider/Chef work orders + collect + cancel
* Meal rarity from ingredient mix + buff scaling
* Market listing/buy/cancel/sales-history พร้อม rarity persistence
* Runtime config สำหรับ balancing หลายโดเมน
* Provider และ Chef skill trees (พร้อมผล gameplay สำคัญ)

#### ยังเป็นช่องต่อยอด
* `Chef MARKET_INTEL` ยังไม่ผูก effect เข้ากับ market bot logic
* ระบบ ecosystem ระดับเมือง/contract chain ยังเป็น phase ถัดไป

---

### 14.19 เป้าหมายเอกสารส่วนนี้

ส่วนนี้ถูกทำไว้เพื่อเป็น “single source of truth” สำหรับการพัฒนาต่อ:
1. ใช้เช็คว่าอะไร implement แล้ว vs ยังเป็น design
2. ใช้เป็น checklist ก่อนแก้บาลานซ์/เพิ่ม feature
3. ใช้เป็นฐานเขียน roadmap เฟสถัดไปแบบไม่หลุดจากโค้ดจริง