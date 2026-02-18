City 2: Ferrum (Workspace Logic)
Concept: "Hunger for Power" (แลกความหิวเป็นความคงทน)
Miner (เทียบเท่า Provider): แทนที่จะ "ปลูกแล้วรอ" (Passive) เปลี่ยนเป็น "ขุดแล้วเหนื่อย" (Active & High Burn)
Blacksmith (เทียบเท่า Chef): แทนที่จะ "ปรุงอาหาร" เปลี่ยนเป็น "ถลุงและประกอบ" (Smelt & Assemble)
1. อาชีพ Miner (ผู้ขุดเจาะ - Provider ฝั่ง City 2)
UI หน้าตาคล้าย "แปลงเกษตร" แต่เปลี่ยนเป็น "โซนเหมือง" (Mining Zones)
Action Logic: Mining Expedition
Selection: ผู้เล่นเลือก "ชั้นเหมือง (Layer)" ที่จะขุด (Surface, Deep, Core)
Input (Cost):
Hunger: ลดทันทีและลดเยอะกว่า City 1 (เช่น -200 Kcal ต่อรอบ) เพราะงานหนัก
Tool Durability: เสียค่าความทนทานของ "Pickaxe" (นำเข้าจาก Blacksmith)
Time: ใช้เวลาขุด (Waiting time)
Output (RNG):
แร่หลัก (Ore): Iron, Copper (ใช้ถลุง)
ของแถม (By-product): Stone (ใช้ก่อสร้าง), Coal (เชื้อเพลิงพื้นฐาน)
Jackpot: Gems (ใช้เพิ่ม Stat ตอนประกอบของ)
Logic ความเสี่ยง (Risk & Safety):
ถ้าขุดชั้นลึก (Deep Layer) โดยไม่ใส่ "Safety Helmet" (จาก City 4) -> Hunger Burn Rate x 2 (เหนื่อยฟรี)
นี่คือจุดเชื่อมโยงว่าทำไมต้องซื้อของจากเมืองอื่น
2. อาชีพ Blacksmith (ช่างตีเหล็ก - Chef ฝั่ง City 2)
UI หน้าตาคล้าย "ครัว" แต่แบ่งเป็น 2 ขั้นตอนคือ เตาถลุง (Smelter) และ โต๊ะประกอบ (Anvil)
Step 1: Smelting (ถลุงแร่)
Logic: เปลี่ยน Ore เป็น Ingot
Constraint: ต้องมีเชื้อเพลิง (Fuel) หล่อเลี้ยง
ผู้เล่นต้องใส่ Coal หรือ Oil (จาก City 3) เข้าไปใน "Fuel Slot"
ถ้า Fuel หมด -> กระบวนการหยุดชะงัก (Pause)
Output: Metal Ingot (วัตถุดิบตั้งต้นเหมือนเนื้อสัตว์ที่สุกแล้ว)
Step 2: Forging & Assembly (การประกอบ - หัวใจสำคัญ)
ใช้ Logic "Component Weighting" (คล้ายการผสม Rarity ของ Chef แต่เน้น Stat)
สูตรการสร้าง: เครื่องมือ 1 ชิ้น = Head (หัว) + Handle (ด้าม)
ตัวอย่าง Logic การคำนวณ Stat:
Head (กำหนดเกรด/ประสิทธิภาพ): ใช้ Ingot
Iron Ingot (Normal): Power = 10
Steel Ingot (Rare): Power = 20
Handle (กำหนดความทนทาน): ใช้ Wood/Plastic
Wood (Normal): Durability = 100
Reinforced Polymer (จาก City 3 - Epic): Durability = 500
ผลลัพธ์ (Final Product):
ถ้าเอา Iron Head + Polymer Handle = จอบที่ขุดเบา (Power 10) แต่โคตรทน (Durability 500) -> เหมาะกับผู้เล่นสายประหยัด (Budget)
ถ้าเอา Steel Head + Wood Handle = จอบที่ขุดแรง (Power 20) แต่พังง่าย (Durability 100) -> เหมาะกับงานเร่งด่วน