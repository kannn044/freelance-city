# Freelance City

Freelance City is a browser-based life-sim / economy game where players build progress through two occupations:

- **Provider** (farm and supply materials)
- **Chef** (cook and sell meals)

Players manage hunger, inventory, equipment, skill trees, marketplace trading, and occupation leveling.

---

## Game Overview

Core gameplay loop:

1. Buy/gather resources
2. Run workspace tasks (farm/cook)
3. Manage hunger and active buffs
4. Equip gear for passive bonuses
5. Trade with NPC shop or player marketplace
6. Gain EXP, level up, and unlock/upgrade skills

### Key Systems

- Authentication (register/login with JWT)
- Hunger & satiety buff system
- Inventory + equipment slots
- Equipment rarity system:
  - Normal, Rare, Epic, Legendary
  - Rarity-based buff scaling
- Provider skill tree (Vegetable / Chicken / Beef branches)
- Workspace tasks with timers and collection
- NPC shop + recipe unlock shop
- Equipment box (gacha-style random drop + rarity odds)
- Player marketplace (list/buy/sales history)
- Market bot support for simulated economy activity

---

## Tech Stack

### Frontend

- React + TypeScript
- Vite
- Zustand
- Framer Motion
- Axios

### Backend

- Node.js + Express + TypeScript
- Prisma ORM
- MySQL
- JWT + bcrypt

---

## Project Structure

```text
freelance-city/
  client/   # React frontend
  server/   # Express + Prisma backend
```

---

## Local Development

## 1) Prerequisites

- Node.js **20.19+** (recommended for current Vite version)
- npm
- MySQL 8+

## 2) Clone and install

```bash
git clone <your-repo-url>
cd freelance-city

cd server && npm install
cd ../client && npm install
```

## 3) Configure backend environment

Create `server/.env`:

```env
DATABASE_URL="mysql://root:password@localhost:3306/freelance_city"
JWT_SECRET="your-secret-key-here"
PORT=4000
```

## 4) Initialize database

```bash
cd server
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

## 5) Run development servers

Terminal 1:
```bash
cd server
npm run dev
```

Terminal 2:
```bash
cd client
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000

---

## Build for Production

### Backend

```bash
cd server
npm run build
npm start
```

### Frontend

```bash
cd client
npm run build
npm run preview
```

---

## Deploy on Linux (Ubuntu Example)

This section describes a common deployment with **PM2 + Nginx + MySQL**.

## 1) Install system packages

```bash
sudo apt update
sudo apt install -y nginx mysql-server
```

Install Node.js (20.19+ or 22.12+ recommended).

## 2) Prepare database

```bash
sudo mysql
CREATE DATABASE freelance_city;
CREATE USER 'fc_user'@'localhost' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON freelance_city.* TO 'fc_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3) Configure server env

Create `server/.env` in your deploy directory:

```env
DATABASE_URL="mysql://fc_user:strong_password@localhost:3306/freelance_city"
JWT_SECRET="replace-with-strong-secret"
ADMIN_SECRET="replace-with-admin-secret"
PORT=4000
```

## 4) Install dependencies + build

```bash
# backend
cd server
npm ci
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run build

# frontend
cd ../client
npm ci
npm run build
```

## 5) Run backend + frontend with PM2

```bash
sudo npm install -g pm2
cd /path/to/freelance-city
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

This starts:

- `freelance-city-server` on port `4000`
- `freelance-city-client` via `vite preview` on port `4173`

Quick PM2 operations:

```bash
pm2 status
pm2 logs freelance-city-server
pm2 logs freelance-city-client
pm2 restart freelance-city-server
pm2 restart freelance-city-client
pm2 stop freelance-city-server
pm2 stop freelance-city-client
pm2 delete freelance-city-server
pm2 delete freelance-city-client
```

After new deployment/build:

```bash
cd /path/to/freelance-city/server
npm ci
npm run build
cd ../client
npm ci
npm run build
cd ..
pm2 restart freelance-city-server
pm2 restart freelance-city-client
```

## 6) Serve frontend with Nginx

Point Nginx root to `client/dist`.

Example `/etc/nginx/sites-available/freelance-city`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /path/to/freelance-city/client/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/freelance-city /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 7) Important production adjustments

1. **Client API URL**
   - Current client uses `http://localhost:4000` in [client/src/lib/api.ts](client/src/lib/api.ts).
   - For production, update it to your API/domain path (for example `/api`) before building frontend.

2. **CORS**
   - Current CORS in [server/src/index.ts](server/src/index.ts) only allows localhost origins.
   - Add your production domain origin(s).

3. **HTTPS (recommended)**
   - Use Certbot + Nginx for SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

4. **Runtime shop pricing (no player-data impact)**
   - You can adjust NPC Shop and Equipment Box prices at runtime without touching existing user inventory/progress.
   - Requires `ADMIN_SECRET` in backend env and authenticated request with header `x-admin-key: <ADMIN_SECRET>`.
   - Endpoints:
     - `GET /game/admin/pricing`
     - `POST /game/admin/pricing` with body:
       - `npcShopMultiplier` (number, e.g. `1.1` = +10%)
       - `equipmentBoxPrice` (integer, e.g. `500`)

---

## Useful Commands

### Server

```bash
npm run dev
npm run build
npm start
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### Client

```bash
npm run dev
npm run build
npm run preview
```

---

## Notes

- If frontend build warns about Node version, upgrade Node to a version supported by your current Vite.
- If schema changes are made, run `npm run prisma:push` and `npm run prisma:generate` again.

---

## License

Set your preferred license for this repository (MIT/Apache-2.0/etc.).
