import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  cancelOpeningStockBatchHandler,
  createManualOpeningStockBatchHandler,
  getOpeningStockBatchHandler,
  listOpeningStockBatchesHandler,
  postOpeningStockBatchHandler,
  validateOpeningStockBatchHandler,
} from "../controllers/opening-stocks.controller.js";

export const openingStocksRouter = Router();

openingStocksRouter.use(requireAuth, requireRole("ADMIN"));

openingStocksRouter.get("/", listOpeningStockBatchesHandler);
openingStocksRouter.get("/:batchId", getOpeningStockBatchHandler);
openingStocksRouter.post("/manual", createManualOpeningStockBatchHandler);
openingStocksRouter.post("/:batchId/validate", validateOpeningStockBatchHandler);
openingStocksRouter.post("/:batchId/post", postOpeningStockBatchHandler);
openingStocksRouter.post("/:batchId/cancel", cancelOpeningStockBatchHandler);
