# Item Asset Guide

ใช้โฟลเดอร์นี้สำหรับรูปไอเทมทั้งหมดในเกม

## แนะนำสเปกไฟล์

- ขนาดมาตรฐาน: **128x128 px**
- ขนาดแนะนำถ้าต้องการคมตอนขยาย: **256x256 px**
- ฟอร์แมตหลัก: **.webp** (เล็กและคม)
- สำรองได้: **.png** (พื้นหลังโปร่งใส)
- พื้นหลัง: **transparent**
- สไตล์: ควรใช้สไตล์เดียวกันทั้งเกม (emoji-flat หรือ cartoon-flat)

## แหล่งหาไอคอน/emoji ที่แนะนำ

- OpenMoji
- Twemoji (Emoji graphics)
- Noto Emoji
- Icons8 Emoji / Fluent Emoji
- Flaticon / Freepik (เช็ค license ก่อนใช้งาน)

---

## โครงสร้างโฟลเดอร์

- seeds/
- raw/
- ingredients/
- meals/
- equipment/provider/
- equipment/chef/
- ui/

---

## ชื่อไฟล์ที่ต้องใช้

### SEED
- seeds/chicken_egg.webp
- seeds/beef_calf.webp
- seeds/vegetable_seed.webp

### RAW
- raw/chicken_meat.webp
- raw/beef_meat.webp
- raw/vegetable.webp

### INGREDIENT
- ingredients/salt.webp

### MEAL
- meals/chicken_salad.webp
- meals/beef_steak.webp

### EQUIPMENT (Provider)
- equipment/provider/sun_hat.webp
- equipment/provider/field_shirt.webp
- equipment/provider/cargo_pants.webp
- equipment/provider/sweatband.webp
- equipment/provider/work_gloves.webp
- equipment/provider/mud_boots.webp

### EQUIPMENT (Chef)
- equipment/chef/toque_blanche.webp
- equipment/chef/apron.webp
- equipment/chef/slack_pants.webp
- equipment/chef/wrist_support.webp
- equipment/chef/latex_gloves.webp
- equipment/chef/anti_slip_shoes.webp

### UI
- ui/equipment_box.webp

---

## หมายเหตุ

- ถ้าไฟล์ไหนหาไม่ได้ ให้ใช้ชื่อไฟล์เดิมแต่เป็น `.png` ได้ เช่น `sun_hat.png`
- แต่แนะนำให้คงนามสกุลให้เหมือนกันทั้งโปรเจกต์เพื่อลดงาน mapping
