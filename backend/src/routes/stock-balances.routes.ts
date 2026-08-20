import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listStockBalancesHandler } from "../controllers/opening-stocks.controller.js";

export const stockBalancesRouter = Router();

stockBalancesRouter.use(requireAuth, requireRole("ADMIN"));

stockBalancesRouter.get("/", listStockBalancesHandler);
