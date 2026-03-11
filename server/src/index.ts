import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import gameRoutes from "./routes/game.routes";
import { marketBotService } from "./services/marketBot.service";
import { initPublicShips, startShipmentCrons } from "./services/shipment.service";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const defaultCorsOrigins = ["http://localhost:5173", "http://localhost:5174"];
const envCorsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultCorsOrigins, ...envCorsOrigins]));

// Middleware
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Request logger (only in development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (duration > 500) {
                console.log(`[SLOW] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
            }
        });
        next();
    });
}

// Routes
app.use("/auth", authRoutes);
app.use("/game", gameRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    marketBotService.start();
    // Always start crons first so ships can depart even if DB init fails on startup
    startShipmentCrons();
    try {
        await initPublicShips();
    } catch (e) {
        console.error("[Startup] initPublicShips failed — crons are still running and will recover:", e);
    }
});

export default app;
