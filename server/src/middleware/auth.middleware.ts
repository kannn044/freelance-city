import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
    userId?: number;
}

export const authMiddleware = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    console.log(`[AUTH MW] ${req.method} ${req.path}`);
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("[AUTH MW] No token provided");
        res.status(401).json({ error: "Access token required" });
        return;
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            userId: number;
        };
        req.userId = decoded.userId;
        console.log(`[AUTH MW] Authenticated userId=${decoded.userId}`);
        next();
    } catch (err: any) {
        console.log("[AUTH MW] Token error:", err.message);
        res.status(401).json({ error: "Invalid or expired token" });
    }
};

