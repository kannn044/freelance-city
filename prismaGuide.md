# 1. สร้าง migration file (รันในเครื่อง dev ก่อน)
npx prisma migrate dev --name init

# 2. Push ขึ้น server จริง แล้วรัน
npx prisma migrate deploy   # ← ใช้อันนี้บน production (ไม่ใช่ migrate dev)
npm run prisma:seed

หรือถ้าไม่ต้องการ track migration history:
npx prisma db push
npm run prisma:seed

สาเหตุที่ Development ใช้ db push แทน migrate dev
สถานการณ์	วิธีที่ถูก
Server ใหม่ (DB ว่าง)	prisma migrate dev --name init → commit files → prisma migrate deploy บน prod
Dev DB เดิม (มี drift เกิดขึ้นแล้ว)	prisma db push --accept-data-loss
Production	prisma migrate deploy (ห้ามใช้ migrate dev)
สิ่งที่ต้องเตรียมก่อน Deploy
Schema ครบแล้ว — ดูจากไฟล์ที่คุณเปิดอยู่ มีทุก model รวมถึง CargoBox, Ship, PurchaseOrder ฯลฯ ครบ
ต้องสร้าง migration files ก่อน — ถ้าจะใช้ migrate deploy บน prod ต้องรัน migrate dev ในเครื่องก่อนแล้ว commit folder server/prisma/migrations/ ขึ้นไปด้วย
.env บน server — ต้องมี DATABASE_URL ชี้ไป database ปลายทาง