# Shipment System — Implementation Plan

> **Version**: 1.0  
> **Date**: 2026-03-10  
> **Status**: Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Database Schema (Prisma)](#3-database-schema-prisma)
4. [Cargo Box System](#4-cargo-box-system)
5. [Marketplace Refactor](#5-marketplace-refactor)
6. [Purchase Order System](#6-purchase-order-system)
7. [Ship System](#7-ship-system)
8. [Pirate (PvP Raid) System](#8-pirate-pvp-raid-system)
9. [Port System](#9-port-system)
10. [Tax & Settlement](#10-tax--settlement)
11. [Notification Center](#11-notification-center)
12. [World Map UI](#12-world-map-ui)
13. [Market Bot Adaptation](#13-market-bot-adaptation)
14. [Fuel Cell Item](#14-fuel-cell-item)
15. [API Endpoints](#15-api-endpoints)
16. [Client Pages & Components](#16-client-pages--components)
17. [WebSocket / Polling](#17-websocket--polling)
18. [Cron Jobs & Background Tasks](#18-cron-jobs--background-tasks)
19. [Migration Strategy](#19-migration-strategy)
20. [Implementation Phases](#20-implementation-phases)

---

## 1. Overview

ระบบซื้อขายปัจจุบัน (Marketplace Hub) จะถูกแยกออกเป็น 2 ส่วน:

| กรณี | Flow |
|------|------|
| **Same-City Trade** | ใช้ Marketplace Hub เดิม (ซื้อ-ขาย instant) |
| **Cross-City Trade** | Cargo Box → List on Marketplace → Purchase Order → Load Ship → Sail → Arrive Port → Buyer Claim |

### Core Loop (Cross-City)

```
ผู้ขาย                                           ผู้ซื้อ
───────                                          ──────
1. ซื้อ Cargo Box จาก NPC Shop
2. แพ็คสินค้าลง Cargo Box
3. ตั้งราคาขาย (per box) → ลง Marketplace
                                          4. เห็น Cargo Box → กดซื้อ
                                             (เงินถูก lock)
5. เห็น Purchase Order เข้ามา
6. เอา Cargo Box ขึ้นเรือ (Public/Private)
7. กดส่งเรือ                            ← ยกเลิกไม่ได้หลังจากนี้
   ⛵ เรือออกเดินทาง...
   🏴‍☠️ อาจถูกโจรสลัดโจมตี (Private Ship เท่านั้น)
8. เรือถึงท่าเรือปลายทาง
   💰 Settlement: เงินหักจากผู้ซื้อ + export/import tax → เข้าผู้ขาย
                                          9. ไปท่าเรือกด Claim
                                             ของเข้า Inventory
```

---

## 2. System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Client      │────▶│  REST API    │────▶│  MySQL (Prisma) │
│  (React+Vite)│◀────│  (Express)   │◀────│                 │
│              │     │              │     │                 │
│  World Map   │◀───▶│  Polling/WS  │     │                 │
│  (SVG)       │     │  (3s tick)   │     │                 │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │  Cron Jobs  │
                    │  • Public Ship departure (5 min)
                    │  • Ship arrival check (3s)
                    │  • Order timeout (10 min)
                    │  • Pirate RPS resolution
                    └─────────────┘
```

---

## 3. Database Schema (Prisma)

### 3.1 New Enums

```prisma
enum CargoBoxSize {
  S    // 5 items, cost 50
  M    // 10 items, cost 100
  L    // 15 items, cost 200
}

enum CargoBoxStatus {
  EMPTY       // ซื้อมาแล้ว ยังไม่แพ็คของ
  PACKING     // กำลังจัดของลงกล่อง (มีของบางส่วน)
  PACKED      // แพ็คเสร็จ พร้อมลงขาย
  LISTED      // ลงขายใน marketplace แล้ว
  SOLD        // ถูกซื้อแล้ว รอผู้ขายจัดส่ง
  ON_SHIP     // อยู่บนเรือ กำลังขนส่ง
  AT_PORT     // ถึงท่าเรือปลายทาง รอผู้ซื้อ claim
  CLAIMED     // ผู้ซื้อ claim แล้ว (terminal state)
  CANCELLED   // ถูกยกเลิก (terminal state)
  PIRATED     // ถูกปล้น (terminal state สำหรับผู้ซื้อดั้งเดิม)
}

enum ShipType {
  PUBLIC      // เรือหลักของระบบ ฟรี ออกทุก 5 นาที
  PRIVATE     // เรือส่วนตัว ใช้ Fuel Cell
}

enum ShipSize {
  S    // Private only: 3 cargo boxes, 1 Fuel Cell, RPS 3
  M    // Private only: 5 cargo boxes, 2 Fuel Cell, RPS 5
  L    // Private only: 10 cargo boxes, 3 Fuel Cell, RPS 7
}

enum ShipStatus {
  DOCKED       // จอดรอที่ท่า (Public Ship)
  LOADING      // กำลังโหลดสินค้า (Private Ship ก่อนกดส่ง)
  SAILING      // กำลังเดินทาง
  ARRIVED      // ถึงปลายทาง
}

enum PurchaseOrderStatus {
  PENDING         // รอผู้ขายจัดส่ง
  CANCELLED_BUYER // ผู้ซื้อยกเลิก (ก่อนขึ้นเรือ)
  CANCELLED_TIMEOUT // หมดเวลา 10 นาที
  SHIPPING        // สินค้าอยู่บนเรือ
  DELIVERED       // สินค้าถึงท่าเรือ (settlement เสร็จ)
  CLAIMED         // ผู้ซื้อ claim ของแล้ว
  PIRATED         // ถูกปล้น
}

enum PirateAttackStatus {
  PENDING     // เรือโจมตีกำลังเดินทางไปหาเป้า
  RESOLVED    // คำนวณ RPS เสร็จแล้ว
}

enum RPSChoice {
  ROCK
  PAPER
  SCISSORS
}
```

### 3.2 New Models

```prisma
// ─── Cargo Box ───────────────────────────────────────────

model CargoBox {
  id          Int             @id @default(autoincrement())
  owner_id    Int
  size        CargoBoxSize
  status      CargoBoxStatus  @default(EMPTY)
  created_at  DateTime        @default(now())
  updated_at  DateTime        @updatedAt

  owner       User            @relation("cargo_boxes", fields: [owner_id], references: [id])
  items       CargoBoxItem[]
  listing     MarketListing?  @relation("cargo_listing")  // 1:1 เมื่อลงขาย
  order       PurchaseOrder?  @relation("cargo_order")     // 1:1 เมื่อถูกซื้อ

  @@index([owner_id, status])
  @@map("cargo_boxes")
}

model CargoBoxItem {
  id                  Int              @id @default(autoincrement())
  cargo_box_id        Int
  item_id             Int
  quantity            Int
  equipment_rarity    EquipmentRarity?
  equipment_durability Float?
  enchant_level       Int              @default(0)
  special_stat_1      String?
  special_stat_2      String?
  special_stat_3      String?
  special_stat_4      String?

  cargo_box           CargoBox         @relation(fields: [cargo_box_id], references: [id], onDelete: Cascade)
  item                Item             @relation(fields: [item_id], references: [id])

  @@index([cargo_box_id])
  @@map("cargo_box_items")
}

// ─── Purchase Order ──────────────────────────────────────

model PurchaseOrder {
  id              Int                   @id @default(autoincrement())
  cargo_box_id    Int                   @unique
  listing_id      Int                   @unique
  buyer_id        Int
  seller_id       Int
  price           Int                   // ราคาขาย (ต่อกล่อง)
  locked_amount   Int                   // เงินที่ lock จากผู้ซื้อ (price + import_tax_estimate)
  export_tax      Int                   @default(0)  // คำนวณตอน settlement
  import_tax      Int                   @default(0)  // คำนวณตอน settlement
  status          PurchaseOrderStatus   @default(PENDING)
  expires_at      DateTime              // created_at + 10 minutes
  created_at      DateTime              @default(now())
  settled_at      DateTime?             // เวลาที่ settlement เสร็จ
  updated_at      DateTime              @updatedAt

  cargo_box       CargoBox              @relation("cargo_order", fields: [cargo_box_id], references: [id])
  listing         MarketListing         @relation("order_listing", fields: [listing_id], references: [id])
  buyer           User                  @relation("purchase_orders_buyer", fields: [buyer_id], references: [id])
  seller          User                  @relation("purchase_orders_seller", fields: [seller_id], references: [id])
  shipment        ShipCargo?            // เมื่อ cargo ขึ้นเรือ

  @@index([buyer_id, status])
  @@index([seller_id, status])
  @@index([expires_at, status])
  @@map("purchase_orders")
}

// ─── Ship ────────────────────────────────────────────────

model Ship {
  id              Int           @id @default(autoincrement())
  type            ShipType
  size            ShipSize?     // NULL for PUBLIC (public = capacity 10)
  owner_id        Int?          // NULL for PUBLIC ships
  origin_city     String        // city_key ต้นทาง
  dest_city       String        // city_key ปลายทาง
  status          ShipStatus    @default(DOCKED)
  capacity        Int           // 10 for public; 3/5/10 for S/M/L private
  departs_at      DateTime?     // Public: scheduled departure time
  departed_at     DateTime?     // เวลาจริงที่ออก
  arrives_at      DateTime?     // departed_at + travel seconds
  rps_sequence    String?       // JSON array of RPSChoice e.g. ["ROCK","PAPER","SCISSORS"]
  is_bot_ship     Boolean       @default(false)  // bot ships can't be pirated
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  owner           User?         @relation("owned_ships", fields: [owner_id], references: [id])
  origin          CityState     @relation("ships_from", fields: [origin_city], references: [city_key])
  destination     CityState     @relation("ships_to", fields: [dest_city], references: [city_key])
  cargo           ShipCargo[]
  attacks         PirateAttack[] @relation("target_ship")

  @@index([origin_city, status])
  @@index([dest_city, status])
  @@index([status, arrives_at])
  @@map("ships")
}

model ShipCargo {
  id              Int           @id @default(autoincrement())
  ship_id         Int
  order_id        Int           @unique
  cargo_box_id    Int
  loaded_at       DateTime      @default(now())

  ship            Ship          @relation(fields: [ship_id], references: [id])
  order           PurchaseOrder @relation(fields: [order_id], references: [id])
  cargo_box       CargoBox      @relation(fields: [cargo_box_id], references: [id])

  @@index([ship_id])
  @@map("ship_cargo")
}

// ─── Pirate Attack ───────────────────────────────────────

model PirateAttack {
  id                Int                @id @default(autoincrement())
  attacker_id       Int
  target_ship_id    Int
  attacker_ship_size ShipSize          // ขนาดเรือโจมตี
  attacker_rps      String             // JSON: ["ROCK","PAPER","SCISSORS"]
  defender_rps      String?            // copy จาก Ship.rps_sequence ตอน resolve
  result_detail     String?            // JSON: ผลแต่ละ round
  attacker_wins     Int?               // จำนวน round ชนะ
  defender_wins     Int?
  draws             Int?
  is_success        Boolean?           // attacker_wins > defender_wins
  fuel_cost         Int                // Fuel Cell ที่ใช้
  credit_cost       Int                // Credit ที่ใช้
  status            PirateAttackStatus @default(PENDING)
  created_at        DateTime           @default(now())
  resolved_at       DateTime?

  attacker          User               @relation("pirate_attacks", fields: [attacker_id], references: [id])
  target_ship       Ship               @relation("target_ship", fields: [target_ship_id], references: [id])

  @@index([attacker_id])
  @@index([target_ship_id, status])
  @@map("pirate_attacks")
}

// ─── Port Storage ────────────────────────────────────────

model UserPortStorage {
  id              Int      @id @default(autoincrement())
  user_id         Int
  city_key        String
  max_slots       Int      @default(5)  // อัพเกรดได้ในอนาคต
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  user            User     @relation("port_storage", fields: [user_id], references: [id])
  city            CityState @relation(fields: [city_key], references: [city_key])

  @@unique([user_id, city_key])
  @@map("user_port_storage")
}

// ─── Notification ────────────────────────────────────────

model Notification {
  id          Int      @id @default(autoincrement())
  user_id     Int
  type        String   // ORDER_CREATED, ORDER_CANCELLED, SHIP_DEPARTED,
                       // SHIP_ARRIVED, CARGO_CLAIMED, PIRATE_ATTACK_WIN,
                       // PIRATE_ATTACK_LOSE, PIRATE_DEFEND_WIN, PIRATE_DEFEND_LOSE,
                       // ORDER_TIMEOUT
  title       String
  body        String
  metadata    String?  // JSON: { orderId, shipId, cargoBoxId, ... }
  is_read     Boolean  @default(false)
  created_at  DateTime @default(now())

  user        User     @relation("notifications", fields: [user_id], references: [id])

  @@index([user_id, is_read, created_at])
  @@map("notifications")
}

// ─── Pirate Cooldown ─────────────────────────────────────

model PirateCooldown {
  id            Int      @id @default(autoincrement())
  user_id       Int      @unique
  last_attack_at DateTime

  user          User     @relation("pirate_cooldown", fields: [user_id], references: [id])

  @@map("pirate_cooldowns")
}
```

### 3.3 Changes to Existing Models

```prisma
// ─── User (add relations) ────────────────────────────────

model User {
  // ... existing fields ...

  // NEW relations
  cargo_boxes      CargoBox[]        @relation("cargo_boxes")
  purchase_orders_as_buyer  PurchaseOrder[]  @relation("purchase_orders_buyer")
  purchase_orders_as_seller PurchaseOrder[]  @relation("purchase_orders_seller")
  owned_ships      Ship[]            @relation("owned_ships")
  port_storage     UserPortStorage[] @relation("port_storage")
  notifications    Notification[]    @relation("notifications")
  pirate_attacks   PirateAttack[]    @relation("pirate_attacks")
  pirate_cooldown  PirateCooldown?   @relation("pirate_cooldown")
  locked_money     Int               @default(0)  // NEW: เงินที่ถูก lock จาก purchase orders
}

// ─── MarketListing (add cargo relation) ──────────────────

model MarketListing {
  // ... existing fields ...

  // NEW fields
  cargo_box_id    Int?          @unique  // NULL = same-city listing (legacy), NOT NULL = cross-city
  is_cross_city   Boolean       @default(false)
  origin_city     String?       // city_key ของผู้ขาย

  // NEW relations
  cargo_box       CargoBox?     @relation("cargo_listing", fields: [cargo_box_id], references: [id])
  purchase_order  PurchaseOrder? @relation("order_listing")
}

// ─── CityState (add ship relations) ──────────────────────

model CityState {
  // ... existing fields ...

  // NEW relations
  ships_from      Ship[]            @relation("ships_from")
  ships_to        Ship[]            @relation("ships_to")
  port_storage    UserPortStorage[]
}

// ─── Item (add CargoBoxItem relation) ────────────────────

model Item {
  // ... existing fields ...
  cargo_box_items CargoBoxItem[]
}
```

### 3.4 New Item in `master-data.json`

```json
{
  "name": "Fuel Cell",
  "type": "INGREDIENT",
  "buy_price": null,
  "sell_price": 30,
  "max_stack": 50,
  "icon": "fuel-cell",
  "exp_value": 1.0,
  "yield_qty": 0
}
```

> Fuel Cell **ผลิตจาก Voltara เท่านั้น** (workspace EXTRACT/REFINE) — ไม่มีใน NPC Shop ของเมืองอื่น ราคาจะถูกกำหนดโดย player market

---

## 4. Cargo Box System

### 4.1 Constants

```typescript
// shared/gameConfig.ts — add
export const CARGO_BOX_CONFIG = {
  sizes: {
    S: { capacity: 5,  price: 50  },
    M: { capacity: 10, price: 100 },
    L: { capacity: 15, price: 200 },
  },
  maxBoxesPerPlayer: 5,  // max owned at any time (EMPTY/PACKING/PACKED/LISTED/SOLD)
} as const;
```

### 4.2 Buy Cargo Box (NPC Shop)

- **Endpoint**: `POST /game/cargo/buy`
- **Body**: `{ size: "S" | "M" | "L" }`
- **Validation**:
  1. ผู้เล่นมี Cargo Box (status ≠ CLAIMED/CANCELLED/PIRATED) ไม่เกิน 5 กล่อง
  2. ผู้เล่นมีเงินเพียงพอ (50 / 100 / 200)
- **Action**:
  1. หักเงิน
  2. สร้าง `CargoBox` record (status = EMPTY)

### 4.3 Pack Items into Cargo Box

- **Endpoint**: `POST /game/cargo/:boxId/pack`
- **Body**: `{ items: [{ inventorySlotId: number, quantity: number }] }`
- **Validation**:
  1. CargoBox เป็นของผู้เล่น, status = EMPTY | PACKING
  2. จำนวน items (รวม existing) ≤ capacity
  3. Inventory slot มีของเพียงพอ
- **Action**:
  1. หักจาก `InventorySlot`
  2. สร้าง/อัพเดท `CargoBoxItem` (copy rarity, enchant, durability, special_stats)
  3. อัพเดท CargoBox status → PACKING (มีของบางส่วน) หรือ PACKED (เมื่อ finalize)

### 4.4 Unpack Items from Cargo Box

- **Endpoint**: `POST /game/cargo/:boxId/unpack`
- **Body**: `{ cargoItemIds: number[] }` (เอาของออก) หรือ `{ all: true }` (เอาทั้งหมด)
- **Validation**:
  1. CargoBox status = EMPTY | PACKING | PACKED (ยังไม่ LISTED)
  2. Inventory มีช่องว่างพอ
- **Action**:
  1. คืนของกลับ `InventorySlot`
  2. ลบ `CargoBoxItem`
  3. ถ้าไม่มีของเหลือ → status = EMPTY

### 4.5 Finalize Cargo Box (พร้อมลงขาย)

- **Endpoint**: `POST /game/cargo/:boxId/finalize`
- **Validation**: CargoBox status = PACKING, มีของอย่างน้อย 1 ชิ้น
- **Action**: status → PACKED

### 4.6 Discard Cargo Box

- **Endpoint**: `DELETE /game/cargo/:boxId`
- **Validation**: status = EMPTY (ไม่มีของ)
- **Action**: ลบ CargoBox (ไม่คืนเงิน)

---

## 5. Marketplace Refactor

### 5.1 Same-City Trade (เดิม)

ไม่เปลี่ยนแปลง — `POST /game/market/sell` / `POST /game/market/buy/:id` ยังคงทำงานเหมือนเดิม  
เพิ่มเงื่อนไข: ทั้งผู้ซื้อและผู้ขายต้องอยู่เมืองเดียวกัน (`is_cross_city = false`)

### 5.2 Cross-City Trade (ใหม่)

#### List Cargo Box on Marketplace

- **Endpoint**: `POST /game/market/sell-cargo`
- **Body**: `{ cargoBoxId: number, price: number }` (ราคาต่อกล่อง)
- **Validation**:
  1. CargoBox status = PACKED, เป็นของผู้เล่น
  2. price > 0
- **Action**:
  1. สร้าง `MarketListing` (is_cross_city=true, cargo_box_id, origin_city=user.city_key)
  2. CargoBox status → LISTED

#### Marketplace Listing View

- **Endpoint**: `GET /game/market` (ปรับ query)
- **Query params**: `?type=cross-city` | `?type=same-city` | default=both
- **Response (cross-city)**:
  ```json
  {
    "id": 1,
    "is_cross_city": true,
    "price": 500,
    "origin_city": "AGRARIA",
    "seller_name": "player1",
    "cargo_box": {
      "id": 10,
      "size": "M",
      "item_count": 8,
      "items": [
        { "item_name": "Iron Ore", "quantity": 5, "icon": "iron-ore", "rarity": null },
        { "item_name": "Steel Sword", "quantity": 1, "icon": "steel-sword", "rarity": "EPIC", "enchant_level": 3 }
      ]
    }
  }
  ```

#### Search Inside Cargo Box

- **Endpoint**: `GET /game/market?search=Iron`
- Cross-city listing จะถูก match ถ้ามี `CargoBoxItem.item.name LIKE %search%`

---

## 6. Purchase Order System

### 6.1 Create Purchase Order (ผู้ซื้อกดซื้อ)

- **Endpoint**: `POST /game/market/buy-cargo/:listingId`
- **Validation**:
  1. Listing exists, status = ACTIVE, is_cross_city = true
  2. Buyer ≠ Seller
  3. Buyer.city_key ≠ Listing.origin_city (ถ้าเมืองเดียวกันให้ใช้ same-city flow)
  4. Buyer port storage ยังมีที่ว่าง (current pending+shipping+at_port < max_slots)
  5. Buyer มีเงินเพียงพอ: `price + estimated_import_tax`
- **Action**:
  1. Lock เงินจากผู้ซื้อ: `user.money -= locked_amount` + `user.locked_money += locked_amount`
  2. สร้าง `PurchaseOrder` (status=PENDING, expires_at=now+10min)
  3. MarketListing status → SOLD
  4. CargoBox status → SOLD
  5. สร้าง `Notification` ให้ผู้ขาย: "New order for your Cargo Box #X"

### 6.2 Cancel Purchase Order (ผู้ซื้อยกเลิก)

- **Endpoint**: `POST /game/order/:orderId/cancel`
- **Validation**:
  1. Order เป็นของผู้ซื้อ
  2. Order status = PENDING (ยังไม่ขึ้นเรือ = ยัง ≠ SHIPPING)
  3. CargoBox status ≠ ON_SHIP
- **Action**:
  1. คืนเงิน: `buyer.money += locked_amount`, `buyer.locked_money -= locked_amount`
  2. Order status → CANCELLED_BUYER
  3. MarketListing status → ACTIVE (กลับไปขายได้อีก)
  4. CargoBox status → LISTED (กลับไปลิสต์)
  5. สร้าง Notification ให้ผู้ขาย: "Order #X was cancelled by buyer"

### 6.3 Order Timeout (Cron Job)

- **ทุก 30 วินาที**: Query `PurchaseOrder` WHERE status=PENDING AND expires_at < NOW()
- **Action**: เหมือน Cancel แต่ status → CANCELLED_TIMEOUT
- **Notification**: แจ้งทั้งผู้ซื้อและผู้ขาย

---

## 7. Ship System

### 7.1 Constants

```typescript
// shared/gameConfig.ts — add
export const SHIP_CONFIG = {
  public: {
    capacity: 10,           // cargo boxes per ship
    departureIntervalMin: 5, // ออกทุก 5 นาที
  },
  private: {
    sizes: {
      S: { capacity: 3,  fuelCost: 1, rpsSlots: 3 },
      M: { capacity: 5,  fuelCost: 2, rpsSlots: 5 },
      L: { capacity: 10, fuelCost: 3, rpsSlots: 7 },
    },
  },
  // เรือโจมตี (pirate)
  pirate: {
    sizes: {
      S: { fuelCost: 1, creditCost: 500,  rpsSlots: 3 },
      M: { fuelCost: 2, creditCost: 1000, rpsSlots: 5 },
      L: { fuelCost: 3, creditCost: 2000, rpsSlots: 7 },
    },
    cooldownMinutes: 30,
  },
} as const;
```

### 7.2 Route Distances

```typescript
// shared/mapData.ts
export const SHIPPING_ROUTES: Record<string, Record<string, number>> = {
  AGRARIA:  { TEXTILIS: 90,  FERRUM: 120, VOLTARA: 180, MEDICO: 250 },
  TEXTILIS: { AGRARIA: 90,   FERRUM: 200, VOLTARA: 260, MEDICO: 180 },
  FERRUM:   { AGRARIA: 120,  TEXTILIS: 200, VOLTARA: 80, MEDICO: 300 },
  VOLTARA:  { AGRARIA: 180,  TEXTILIS: 260, FERRUM: 80, MEDICO: 150 },
  MEDICO:   { AGRARIA: 250,  TEXTILIS: 180, FERRUM: 300, VOLTARA: 150 },
};
// 1 nautical mile = 1 second travel time
export function getTravelTimeSeconds(from: string, to: string): number {
  return SHIPPING_ROUTES[from]?.[to] ?? 0;
}
```

### 7.3 Public Ships

#### Initialization (Server Startup)

- สำหรับทุกคู่เมือง (5×4=20 เส้นทาง) สร้าง Public Ship 1 ลำ per route
- ตั้ง `departs_at` = next 5-minute mark
- **Total public ships**: 20 ลำ (เมือง A→B, A→C, A→D, A→E, B→A, B→C, ...)

#### Public Ship Departure Cycle (Cron: ทุก 5 นาที)

```
1. หา Public Ships ที่ status=DOCKED AND departs_at <= NOW()
2. สำหรับแต่ละลำ:
   a. status → SAILING
   b. departed_at = NOW()
   c. arrives_at = NOW() + getTravelTimeSeconds(origin, dest)
3. สร้าง Public Ship ลำใหม่สำหรับ route เดียวกัน (status=DOCKED, departs_at=NOW()+5min)
```

#### Load Cargo onto Public Ship

- **Endpoint**: `POST /game/ship/public/load`
- **Body**: `{ orderId: number, originCity: string, destCity: string }`
- **Validation**:
  1. Order เป็นของผู้ขาย, status = PENDING
  2. Order ยังไม่ถูก cancel
  3. Public Ship สำหรับ route นี้ status=DOCKED
  4. Ship ยังมีที่ว่าง (current cargo count < capacity)
- **Action**:
  1. สร้าง `ShipCargo` record
  2. Order status → SHIPPING
  3. CargoBox status → ON_SHIP
  4. Notification ให้ผู้ซื้อ: "Your order is on a ship!"

### 7.4 Private Ships

#### Rent Private Ship

- **Endpoint**: `POST /game/ship/private/rent`
- **Body**: `{ size: "S"|"M"|"L", destCity: string, rpsSequence: ["ROCK","PAPER",...] }`
- **Validation**:
  1. ผู้เล่นมี Fuel Cell เพียงพอ (S=1, M=2, L=3) ใน inventory
  2. destCity ≠ user.city_key
  3. rpsSequence length = rpsSlots ของ size ที่เลือก (S=3, M=5, L=7)
  4. rpsSequence ทุกค่าเป็น ROCK | PAPER | SCISSORS
- **Action**:
  1. หัก Fuel Cell จาก inventory
  2. สร้าง Ship (type=PRIVATE, status=LOADING, owner_id=userId)
  3. Return shipId

#### Load Cargo onto Private Ship

- **Endpoint**: `POST /game/ship/private/:shipId/load`
- **Body**: `{ orderId: number }`
- **Validation**:
  1. Ship เป็นของผู้เล่น, status=LOADING
  2. Order เป็นของผู้ขาย, status=PENDING, ยังไม่ cancel
  3. Order destination = Ship destination
  4. Ship ยังมีที่ว่าง
- **Action**: เหมือน public load

#### Dispatch Private Ship

- **Endpoint**: `POST /game/ship/private/:shipId/dispatch`
- **Validation**:
  1. Ship เป็นของผู้เล่น, status=LOADING
  2. Ship มี cargo อย่างน้อย 1 box
- **Action**:
  1. status → SAILING
  2. departed_at = NOW()
  3. arrives_at = NOW() + getTravelTimeSeconds(origin, dest)
  4. Notification ทุก buyer ที่มี cargo บนเรือ: "Your cargo has departed!"

### 7.5 Ship Arrival (Cron: ทุก 3 วินาที)

```
1. หา Ships ที่ status=SAILING AND arrives_at <= NOW()
   AND ship ไม่มี pending pirate attacks (PirateAttack.status=PENDING)
2. สำหรับแต่ละลำ:
   a. status → ARRIVED
   b. สำหรับแต่ละ ShipCargo:
      i.   PurchaseOrder status → DELIVERED
      ii.  CargoBox status → AT_PORT
      iii. Settlement (ดู Section 10)
      iv.  Notification ผู้ซื้อ: "Your cargo has arrived at port!"
      v.   Notification ผู้ขาย: "Your cargo was delivered. Payment received!"
```

---

## 8. Pirate (PvP Raid) System

### 8.1 Attack Flow

#### Launch Pirate Attack

- **Endpoint**: `POST /game/pirate/attack`
- **Body**: `{ targetShipId: number, shipSize: "S"|"M"|"L", rpsSequence: ["ROCK",...] }`
- **Validation**:
  1. Target Ship: status=SAILING, type=PRIVATE, is_bot_ship=false
  2. Attacker ≠ ship owner
  3. Attacker ≠ buyer ของ cargo ใดๆ บนเรือ
  4. Attacker ไม่มี cooldown (last_attack_at + 30min < NOW())
  5. Attacker มี Fuel Cell เพียงพอ (S=1, M=2, L=3)
  6. Attacker มี Credit เพียงพอ (S=500, M=1000, L=2000)
  7. rpsSequence length ตรงกับ size (S=3, M=5, L=7)
  8. Ship ยังไม่มี pending pirate attack (first-come-first-served)
- **Action**:
  1. หัก Fuel Cell + Credit จาก attacker
  2. สร้าง `PirateAttack` (status=PENDING)
  3. อัพเดท/สร้าง `PirateCooldown` record
  4. ทำ RPS resolution ทันที (ดู 8.2)

### 8.2 RPS Resolution Logic

```typescript
function resolveRPS(defenderSeq: RPSChoice[], attackerSeq: RPSChoice[]): {
  attackerWins: number;
  defenderWins: number;
  draws: number;
  rounds: { defender: RPSChoice; attacker: RPSChoice; result: 'W'|'L'|'D' }[];
} {
  const minLen = Math.min(defenderSeq.length, attackerSeq.length);
  let attackerWins = 0, defenderWins = 0, draws = 0;
  const rounds = [];
  
  for (let i = 0; i < minLen; i++) {
    const d = defenderSeq[i], a = attackerSeq[i];
    if (d === a) {
      draws++;
      rounds.push({ defender: d, attacker: a, result: 'D' });
    } else if (
      (d === 'ROCK' && a === 'SCISSORS') ||
      (d === 'PAPER' && a === 'ROCK') ||
      (d === 'SCISSORS' && a === 'PAPER')
    ) {
      defenderWins++;
      rounds.push({ defender: d, attacker: a, result: 'L' }); // attacker loses
    } else {
      attackerWins++;
      rounds.push({ defender: d, attacker: a, result: 'W' }); // attacker wins
    }
  }
  
  // Remaining defender slots (attacker has no more) = draws (attacker gains no advantage)
  for (let i = minLen; i < defenderSeq.length; i++) {
    draws++;
    rounds.push({ defender: defenderSeq[i], attacker: null, result: 'D' });
  }

  return { attackerWins, defenderWins, draws, rounds };
}

// ผลลัพธ์: attacker ชนะก็ต่อเมื่อ attackerWins > defenderWins (strict)
```

### 8.3 Attack Success

เมื่อ `is_success = true` (attacker wins):
1. ย้ายสินค้าทั้งหมดบนเรือไปท่าเรือของ **attacker** (ที่เมืองของ attacker)
2. สำหรับแต่ละ order on ship:
   - Order status → PIRATED
   - CargoBox status → PIRATED (สำหรับ buyer/seller เดิม)
   - สร้าง **CargoBox ใหม่** ให้ attacker (status=AT_PORT, copy items) ที่ท่าเรือเมือง attacker
   - Buyer เสียเงินที่ lock ไว้ (ไม่คืน) → `locked_money -= locked_amount`
   - Seller เสียของ (ของหายไปแล้วตั้งแต่แพ็ค)
3. Notifications:
   - Attacker: "Pirate raid successful! Check your port for loot."
   - Ship owner (seller): "Your ship was raided by pirates! Cargo lost."
   - Buyer(s): "The ship carrying your order was pirated. Payment lost."

### 8.4 Attack Failure / Draw

เมื่อ `is_success = false` หรือ เสมอ:
1. ไม่มีอะไรเกิดขึ้น — เรือเดินทางต่อปกติ
2. Attacker เสีย Fuel Cell + Credit ที่จ่ายไปแล้ว (ไม่คืน)
3. Notifications:
   - Attacker: "Pirate raid failed! Your ship retreated."
   - Ship owner: "A pirate tried to attack your ship but failed!"

---

## 9. Port System

### 9.1 Port Storage Initialization

เมื่อผู้เล่น claim cargo ครั้งแรกที่เมืองใดเมืองหนึ่ง → สร้าง `UserPortStorage` (max_slots=5)

### 9.2 View Port

- **Endpoint**: `GET /game/port`
- **Response**:
  ```json
  {
    "storage": { "max_slots": 5, "used_slots": 2 },
    "cargo_boxes": [
      {
        "id": 15,
        "order_id": 8,
        "status": "AT_PORT",
        "source": "pirate" | "trade",
        "items": [...],
        "arrived_at": "2026-03-10T12:00:00Z"
      }
    ]
  }
  ```

### 9.3 Claim Cargo (รับของจากท่าเรือ)

- **Endpoint**: `POST /game/port/claim/:cargoBoxId`
- **Validation**:
  1. CargoBox status = AT_PORT
  2. ผู้เล่นเป็นผู้ซื้อ (จาก PurchaseOrder) หรือ เป็น pirate attacker
  3. Inventory มีช่องว่างเพียงพอสำหรับทุก item ใน cargo
- **Action**:
  1. ย้ายของจาก `CargoBoxItem` → `InventorySlot` (คงค่า rarity, enchant, durability)
  2. Order status → CLAIMED (ถ้าเป็น trade)
  3. CargoBox status → CLAIMED
  4. ลดจำนวน used_slots ของ port storage

### 9.4 Port Storage Upgrade (Future-ready)

- **Endpoint**: `POST /game/port/upgrade`
- **Body**: `{ city: string }`
- **Design**: `UserPortStorage.max_slots` เพิ่มขึ้นทีละ 5 (5→10→15→...)
- **Price**: กำหนดในอนาคต (ยังไม่ implement ใน Phase 1)

---

## 10. Tax & Settlement

### 10.1 Settlement Flow (เมื่อเรือถึงท่า)

```typescript
async function settleOrder(order: PurchaseOrder, tx: PrismaTransaction) {
  const sellerCity = await getCityState(order.seller.city_key, tx);
  const buyerCity  = await getCityState(order.buyer.city_key, tx);

  // Export tax (หักจากผู้ขาย)
  const exportTaxBp = sellerCity.export_tax_bp;  // basis points
  const exportTax = Math.floor(order.price * exportTaxBp / 10000);

  // Import tax (หักจากผู้ซื้อ)
  const importTaxBp = buyerCity.import_tax_bp;
  const importTax = Math.floor(order.price * importTaxBp / 10000);

  // ผู้ขายได้รับ
  const sellerReceives = order.price - exportTax;

  // ผู้ซื้อจ่าย
  const buyerPays = order.price + importTax;

  // Settlement
  // 1. Unlock buyer money & deduct actual amount
  await tx.user.update({
    where: { id: order.buyer_id },
    data: {
      locked_money: { decrement: order.locked_amount },
      money: { increment: order.locked_amount - buyerPays },
      // ถ้า locked_amount > buyerPays → คืนส่วนต่างเป็น money
      // ถ้า locked_amount < buyerPays → ไม่ควรเกิด (ล็อคเกินไว้)
    },
  });

  // 2. ผู้ขายรับเงิน
  await tx.user.update({
    where: { id: order.seller_id },
    data: { money: { increment: sellerReceives } },
  });

  // 3. ภาษีเข้า treasury ของแต่ละเมือง
  await tx.cityState.update({
    where: { city_key: sellerCity.city_key },
    data: { treasury: { increment: exportTax } },
  });
  await tx.cityState.update({
    where: { city_key: buyerCity.city_key },
    data: { treasury: { increment: importTax } },
  });

  // 4. อัพเดท order
  await tx.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: 'DELIVERED',
      export_tax: exportTax,
      import_tax: importTax,
      settled_at: new Date(),
    },
  });
}
```

### 10.2 Lock Amount Calculation (ตอนซื้อ)

```typescript
// Lock มากกว่าราคาจริงเล็กน้อย เพื่อครอบคลุม import tax
const importTaxBp = buyerCity.import_tax_bp;
const estimatedImportTax = Math.ceil(price * importTaxBp / 10000);
const lockedAmount = price + estimatedImportTax;
```

---

## 11. Notification Center

### 11.1 Notification Types

| Type | ผู้รับ | ตัวอย่างข้อความ |
|------|--------|-----------------|
| `ORDER_CREATED` | Seller | "New order received for Cargo Box #10" |
| `ORDER_CANCELLED_BUYER` | Seller | "Order #5 was cancelled by buyer" |
| `ORDER_CANCELLED_TIMEOUT` | Both | "Order #5 expired (seller did not ship)" |
| `SHIP_DEPARTED` | Buyer | "Your order #5 has departed from Agraria" |
| `SHIP_ARRIVED` | Buyer | "Your cargo has arrived at Ferrum port!" |
| `SETTLEMENT_COMPLETE` | Seller | "Payment received for Cargo Box #10: 470 credits" |
| `PIRATE_ATTACK_WIN` | Attacker | "Raid successful! Loot at your port" |
| `PIRATE_ATTACK_LOSE` | Attacker | "Raid failed! Ship retreated" |
| `PIRATE_DEFEND_WIN` | Ship owner | "A pirate tried to raid your ship but failed!" |
| `PIRATE_DEFEND_LOSE` | Ship owner | "Your ship was raided! Cargo lost" |
| `PIRATE_VICTIM_BUYER` | Buyer | "Ship carrying your order was pirated" |

### 11.2 API

- **GET /game/notifications** — list notifications (paginated, newest first)
- **GET /game/notifications/unread-count** — `{ count: number }`
- **POST /game/notifications/read** — `{ ids: number[] }` mark as read
- **POST /game/notifications/read-all** — mark all as read

### 11.3 Client Component

`NotificationCenter.tsx` — Dropdown on TopNavBar:
- Bell icon + badge (unread count)
- Click to open dropdown
- List of notifications with icon, title, time
- "Mark all as read" button
- Polling unread count ทุก 10 วินาที

---

## 12. World Map UI

### 12.1 Map Data

```typescript
// client/src/lib/mapData.ts

export const citiesData = [
  { id: "AGRARIA",  name: "Agraria",  x: 200, y: 300, color: "#4ade80", type: "Food & Agriculture" },
  { id: "TEXTILIS", name: "Textilis", x: 250, y: 480, color: "#c084fc", type: "Textiles & Fashion" },
  { id: "FERRUM",   name: "Ferrum",   x: 450, y: 150, color: "#94a3b8", type: "Industry & Tools" },
  { id: "VOLTARA",  name: "Voltara",  x: 550, y: 220, color: "#facc15", type: "Energy & Fuel" },
  { id: "MEDICO",   name: "Medico",   x: 700, y: 400, color: "#38bdf8", type: "Science & Alchemy" },
];

export const shippingRoutes = [
  { source: "FERRUM",   target: "VOLTARA",  distance: 80  },
  { source: "AGRARIA",  target: "TEXTILIS", distance: 90  },
  { source: "AGRARIA",  target: "FERRUM",   distance: 120 },
  { source: "VOLTARA",  target: "MEDICO",   distance: 150 },
  { source: "AGRARIA",  target: "VOLTARA",  distance: 180 },
  { source: "TEXTILIS", target: "MEDICO",   distance: 180 },
  { source: "FERRUM",   target: "TEXTILIS", distance: 200 },
  { source: "AGRARIA",  target: "MEDICO",   distance: 250 },
  { source: "VOLTARA",  target: "TEXTILIS", distance: 260 },
  { source: "FERRUM",   target: "MEDICO",   distance: 300 },
];
```

### 12.2 World Map Page

- **Route**: `/world-map`
- **SVG Render**:
  - พื้นหลังธีมทะเล (ocean gradient)
  - เมือง 5 จุด (circle + label + สีตาม citiesData)
  - เส้น route ระหว่างเมือง (dashed line, สี neutral)
  - เรือที่กำลัง SAILING: animated position ระหว่าง origin → destination
    - คำนวณ position จาก `(NOW() - departed_at) / (arrives_at - departed_at)` 
    - Interpolate x,y ระหว่างจุด 2 เมือง
  - Public ship = icon สีน้ำเงิน, Private ship = icon สีเหลือง
  - เรือแต่ละลำ: tooltip แสดง ship type, size, origin → dest, cargo count
  - เรือ private: แสดง size (S/M/L) เพื่อให้โจรสลัดเห็น
  - ไม่แสดงรายละเอียดของข้างใน

### 12.3 Ship Data API

- **Endpoint**: `GET /game/world-map/ships`
- **Response**:
  ```json
  {
    "ships": [
      {
        "id": 1,
        "type": "PUBLIC",
        "size": null,
        "origin": "AGRARIA",
        "dest": "FERRUM",
        "status": "SAILING",
        "departed_at": "...",
        "arrives_at": "...",
        "cargo_count": 5,
        "is_bot_ship": false
      }
    ],
    "server_time": "2026-03-10T12:00:00Z"
  }
  ```
- Polling: client จะ call ทุก 3 วินาที

---

## 13. Market Bot Adaptation

### 13.1 Bot Selling Flow (Cross-City)

Bot จะทำตาม flow เดียวกับผู้เล่น:

```
1. Bot สร้าง Cargo Box (size ตาม quantity)
2. Bot แพ็คสินค้าลงกล่อง
3. Bot ลง marketplace (cross-city)
4. เมื่อมี order → Bot rent private ship (is_bot_ship=true)
5. Bot load cargo → dispatch ทันที
6. เรือ bot โดนปล้นไม่ได้ (is_bot_ship=true → ไม่แสดงบน world map หรือแสดงแต่ block attack)
```

### 13.2 Bot Buying Flow

Bot ยังซื้อ same-city เหมือนเดิม ไม่ซื้อ cross-city (ทำให้ง่าย)

### 13.3 Bot Fuel Cell

Bot ที่ Voltara สามารถ "สร้าง" Fuel Cell ให้ตัวเองได้ (special logic เพื่อไม่ให้ economy พัง)

---

## 14. Fuel Cell Item

### 14.1 Item Definition

| Field | Value |
|-------|-------|
| name | Fuel Cell |
| type | INGREDIENT |
| buy_price | NULL (ไม่ขายที่ NPC Shop) |
| sell_price | 30 (ขายคืน NPC) |
| max_stack | 50 |
| icon | fuel-cell |

### 14.2 Production

- **เมือง**: Voltara เท่านั้น
- **Workspace mode**: REFINE (secondary job: Engineer)
- เพิ่ม recipe ใน Voltara workspace สำหรับผลิต Fuel Cell
- ต้อง seed data recipe ใหม่

### 14.3 Distribution

ผู้เล่นเมืองอื่นต้อง **ซื้อจากตลาด** (from Voltara players) — สร้าง economy loop

---

## 15. API Endpoints

### 15.1 New Routes Summary

```
// ─── Cargo Box ───────────────────────────────
GET    /game/cargo                          // list user's cargo boxes
POST   /game/cargo/buy                      // buy cargo box from NPC
POST   /game/cargo/:boxId/pack              // pack items into box
POST   /game/cargo/:boxId/unpack            // unpack items from box
POST   /game/cargo/:boxId/finalize          // mark as packed/ready to list
DELETE /game/cargo/:boxId                    // discard empty box

// ─── Marketplace (additions) ─────────────────
POST   /game/market/sell-cargo              // list cargo box for sale
POST   /game/market/buy-cargo/:listingId    // buy cargo box → create order
GET    /game/market                         // existing (add ?type= filter & search)

// ─── Purchase Orders ─────────────────────────
GET    /game/orders                         // list my orders (buyer & seller)
GET    /game/orders/:orderId                // order detail
POST   /game/orders/:orderId/cancel         // buyer cancel order

// ─── Ships ───────────────────────────────────
POST   /game/ship/public/load               // load cargo onto public ship
GET    /game/ship/public/schedule            // view public ship schedules
POST   /game/ship/private/rent              // rent a private ship
POST   /game/ship/private/:shipId/load      // load cargo onto private ship
POST   /game/ship/private/:shipId/dispatch  // send private ship

// ─── Pirate ──────────────────────────────────
POST   /game/pirate/attack                  // launch pirate attack
GET    /game/pirate/cooldown                // check cooldown status
GET    /game/pirate/history                 // past raids

// ─── Port ────────────────────────────────────
GET    /game/port                           // view port storage
POST   /game/port/claim/:cargoBoxId         // claim cargo from port

// ─── World Map ───────────────────────────────
GET    /game/world-map/ships                // active ships for map rendering

// ─── Notifications ───────────────────────────
GET    /game/notifications                  // list notifications
GET    /game/notifications/unread-count     // badge count
POST   /game/notifications/read             // mark as read
POST   /game/notifications/read-all         // mark all as read
```

---

## 16. Client Pages & Components

### 16.1 New Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/cargo` | `CargoPage.tsx` | Cargo Box management: ซื้อ, แพ็ค, unpack, list |
| `/port` | `PortPage.tsx` | ท่าเรือ: รับของ, ดู storage |
| `/world-map` | `WorldMapPage.tsx` | แผนที่โลก SVG + เรือ real-time |

### 16.2 New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `CargoBoxCard.tsx` | `components/cargo/` | แสดง cargo box + items ข้างใน |
| `CargoPackModal.tsx` | `components/cargo/` | Modal จัดของลงกล่อง (drag & drop จาก inventory) |
| `PurchaseOrderList.tsx` | `components/orders/` | แสดง orders ทั้งฝั่ง buyer/seller |
| `ShipLoadModal.tsx` | `components/ship/` | เลือก cargo → load ลงเรือ |
| `PrivateShipModal.tsx` | `components/ship/` | เช่าเรือ, ตั้ง RPS, กดส่ง |
| `PirateAttackModal.tsx` | `components/pirate/` | โจมตีเรือ: เลือก size, ตั้ง RPS |
| `WorldMapSVG.tsx` | `components/world-map/` | SVG map: เมือง, เส้นทาง, เรือ animated |
| `NotificationCenter.tsx` | `components/` | Dropdown + badge ที่ TopNavBar |
| `PublicShipSchedule.tsx` | `components/ship/` | ตารางเรือหลัก + countdown |
| `PortCargoList.tsx` | `components/port/` | รายการ cargo ที่ท่าเรือ |
| `RPSSequenceInput.tsx` | `components/shared/` | Input สำหรับเลือก Rock/Paper/Scissors sequence |

### 16.3 Navigation Changes

**TopNavBar.tsx** — เพิ่ม:
- Tab "Cargo" → `/cargo`
- Tab "Port" → `/port`
- Tab "World Map" → `/world-map`
- Bell icon + `NotificationCenter` dropdown

### 16.4 MarketPanel Changes

- เพิ่ม toggle: "Same City" | "Cross City"
- Cross City view: แสดง Cargo Box cards แทน item rows
- ปุ่ม "Buy" → สร้าง purchase order (confirm dialog แสดงราคา + estimated tax)
- Search: ค้นหาทั้ง item name ข้างใน cargo box

---

## 17. WebSocket / Polling

### 17.1 Strategy: HTTP Polling

ใช้ HTTP polling แทน WebSocket เพื่อความง่าย:

| Endpoint | Interval | Page |
|----------|----------|------|
| `GET /game/world-map/ships` | 3s | World Map |
| `GET /game/notifications/unread-count` | 10s | TopNavBar (global) |
| `GET /game/orders` | 10s | Cargo page, when viewing orders |
| `GET /game/port` | 10s | Port page |

### 17.2 Future: WebSocket Upgrade

หากต้องการ real-time มากขึ้น ให้เปลี่ยนเป็น WebSocket ในอนาคต  
Design เตรียมไว้โดยใช้ event pattern:

```typescript
type ShipEvent = 
  | { type: 'SHIP_DEPARTED'; shipId: number }
  | { type: 'SHIP_ARRIVED'; shipId: number }
  | { type: 'PIRATE_ATTACK'; shipId: number; attackId: number }
  | { type: 'PIRATE_RESULT'; attackId: number; success: boolean };
```

---

## 18. Cron Jobs & Background Tasks

### 18.1 Public Ship Departure (ทุก 5 นาที)

```
- Query: Ships WHERE type=PUBLIC AND status=DOCKED AND departs_at <= NOW()
- Dispatch each ship
- Create new DOCKED ship for same route (departs_at = NOW() + 5min)
```

### 18.2 Ship Arrival Check (ทุก 3 วินาที)

```
- Query: Ships WHERE status=SAILING AND arrives_at <= NOW()
  AND NO pending PirateAttack on this ship
- For each: settle orders, move cargo to port, notify
```

### 18.3 Order Timeout (ทุก 30 วินาที)

```
- Query: PurchaseOrders WHERE status=PENDING AND expires_at <= NOW()
- For each: cancel, refund, notify
```

### 18.4 Pirate Resolution (ทันทีเมื่อ attack)

Pirate RPS จะถูกคำนวณทันทีเมื่อมีการโจมตี (ไม่ต้องรอ cron)  
แต่ผล (cargo transfer) จะถูก apply หลังจาก RPS resolve:
- ถ้าชนะ → cargo ย้ายทันที, ship arrival process skip cargo ที่ถูกปล้น  
- ถ้าแพ้/เสมอ → ไม่มีผล, ship เดินทางต่อ

---

## 19. Migration Strategy

### 19.1 Database Migration

```bash
# 1. เพิ่ม schema ใหม่ (ไม่กระทบ data เดิม)
npx prisma migrate dev --name add_shipment_system

# 2. Seed public ships (20 ลำ)
npx prisma db seed -- --shipment-init

# 3. Seed Fuel Cell item
# (เพิ่มใน master-data.json → seed.ts)
```

### 19.2 Marketplace Backward Compatibility

- MarketListing เดิม (is_cross_city=false) ทำงานเหมือนเดิม
- ผู้เล่นเมืองเดียวกันยังซื้อขายแบบ instant
- ไม่มี breaking change กับ listing เก่า

### 19.3 Rollback Plan

- Toggle feature flag: `GameSetting { key: "shipment_enabled", value: "true" }`
- ถ้า disabled → ซ่อน cross-city marketplace, cargo, port, world map tabs
- Same-city trade ทำงานปกติ

---

## 20. Implementation Phases

### Phase 1: Core Infrastructure (Cargo + Orders)
1. Database migration (new models + enums)
2. Seed Fuel Cell item
3. Cargo Box CRUD (buy, pack, unpack, finalize, discard)
4. Cargo management UI page
5. Cross-city marketplace listing + buying
6. Purchase Order system (create, cancel, timeout cron)
7. Notification model + basic API

### Phase 2: Shipping
8. Public Ship system (init, departure cron, loading)
9. Private Ship system (rent, load, dispatch)
10. Ship arrival + settlement logic
11. Travel time calculation
12. Ship schedule UI
13. Port system (claim cargo, storage)
14. Port UI page

### Phase 3: World Map + Real-time
15. World Map SVG page (cities, routes, animated ships)
16. Ship position polling (3s)
17. Notification Center UI (TopNavBar dropdown + badge)
18. Navigation tab updates

### Phase 4: Pirate System
19. Pirate attack endpoint + RPS resolution
20. Cooldown system
21. Pirate attack UI (modal + RPS input)
22. Loot transfer logic
23. Pirate notifications
24. World Map: show ship sizes for pirate targeting

### Phase 5: Bot Adaptation
25. Bot Cargo Box creation
26. Bot private ship dispatch (is_bot_ship=true)
27. Bot Fuel Cell economy (Voltara)
28. Bot cross-city selling flow

### Phase 6: Polish & Testing
29. E2E testing: full trade flow (list → buy → ship → arrive → claim)
30. E2E testing: pirate flow (attack → RPS → loot/fail)
31. Edge cases: concurrent ship loading, double-buy prevention
32. Performance: polling optimization, DB indexes
33. i18n: Thai + English translations for new UI
34. Feature flag toggle test

---

## Appendix A: Database Diagram

```
User ─────────┬── CargoBox ──── CargoBoxItem ──── Item
              │       │
              │       └── MarketListing (cargo_box_id)
              │       │
              │       └── PurchaseOrder
              │              │
              │              └── ShipCargo ──── Ship
              │                                  │
              │                                  └── PirateAttack
              │
              ├── UserPortStorage
              ├── Notification
              └── PirateCooldown
```

## Appendix B: State Machines

### CargoBox States
```
EMPTY → PACKING → PACKED → LISTED → SOLD → ON_SHIP → AT_PORT → CLAIMED
                    ↑         │                          │
                    │         ↓                          ↓
                    └── (unpack) ── EMPTY          PIRATED
                              │
                              ↓
                         CANCELLED (buyer cancel / timeout)
                              ↓
                           LISTED (re-list)
```

### PurchaseOrder States
```
PENDING ──→ SHIPPING ──→ DELIVERED ──→ CLAIMED
   │                         │
   ├──→ CANCELLED_BUYER      └──→ PIRATED
   └──→ CANCELLED_TIMEOUT
```

### Ship States
```
DOCKED ──→ LOADING ──→ SAILING ──→ ARRIVED
  (public)   (private)
```
