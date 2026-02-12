import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import gameRoutes from "./routes/game.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"], credentials: true }));
app.use(express.json());

// Request logger (debug)
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    const start = Date.now();
    res.on('finish', () => {
        console.log(`📤 ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
});

// Routes
app.use("/auth", authRoutes);
app.use("/game", gameRoutes);

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
