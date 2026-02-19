import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { castMayorVote, getCityGovernance, updateCityTaxesByMayor } from "../services/city.service";

export const getCityGovernanceController = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const governance = await getCityGovernance(req.userId!);
        res.json({ governance });
    } catch (error: any) {
        const message = String(error?.message ?? "Failed to fetch city governance");
        const status = message.toLowerCase().includes("not found") ? 404 : 400;
        res.status(status).json({ error: message });
    }
};

export const voteMayorController = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const candidateUserId = Number(req.body?.candidateUserId);
        if (!Number.isFinite(candidateUserId) || candidateUserId <= 0) {
            res.status(400).json({ error: "candidateUserId is required" });
            return;
        }

        const result = await castMayorVote(req.userId!, candidateUserId);
        const governance = await getCityGovernance(req.userId!);

        res.json({
            message: `Vote submitted for candidate #${candidateUserId}`,
            result,
            governance,
        });
    } catch (error: any) {
        const message = String(error?.message ?? "Failed to submit vote");
        res.status(400).json({ error: message });
    }
};

export const setCityTaxesController = async (
    req: AuthRequest,
    res: Response,
): Promise<void> => {
    try {
        const domesticPct = req.body?.domesticPct != null ? Number(req.body.domesticPct) : undefined;
        const exportPct = req.body?.exportPct != null ? Number(req.body.exportPct) : undefined;
        const importPct = req.body?.importPct != null ? Number(req.body.importPct) : undefined;

        const city = await updateCityTaxesByMayor(req.userId!, {
            domesticPct,
            exportPct,
            importPct,
        });

        const governance = await getCityGovernance(req.userId!);

        res.json({
            message: "City taxes updated",
            city,
            governance,
        });
    } catch (error: any) {
        const message = String(error?.message ?? "Failed to update taxes");
        const lower = message.toLowerCase();
        const status = lower.includes("only current mayor") ? 403 : 400;
        res.status(status).json({ error: message });
    }
};
