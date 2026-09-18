import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  confirmLegacyOpeningInTransitHandler,
  listStockBalancesHandler,
  listStockLedgerHandler,
} from "../controllers/stock-balances.controller.js";

export const stockBalancesRouter = Router();

stockBalancesRouter.use(requireAuth, requireRole("ADMIN", "MAKER", "CHECKER"));

stockBalancesRouter.get("/ledger", listStockLedgerHandler);
stockBalancesRouter.post(
  "/legacy-opening-in-transit/:lineId/confirm",
  confirmLegacyOpeningInTransitHandler,
);
stockBalancesRouter.get("/", listStockBalancesHandler);
