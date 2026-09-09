import { Router } from "express";
import {
  createPurchaseHandler,
  deletePurchaseHandler,
  getPurchaseHandler,
  listPurchasesHandler,
  updatePurchaseHandler,
} from "../controllers/purchases.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const purchasesRouter = Router();

const accessRoles = requireRole("ADMIN", "MAKER", "CHECKER");

purchasesRouter.use(requireAuth, accessRoles);

purchasesRouter.get("/", listPurchasesHandler);
purchasesRouter.get("/:id", getPurchaseHandler);
purchasesRouter.post("/", createPurchaseHandler);
purchasesRouter.patch("/:id", updatePurchaseHandler);
purchasesRouter.delete("/:id", deletePurchaseHandler);
