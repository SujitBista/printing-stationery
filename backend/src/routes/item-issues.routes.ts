import { Router } from "express";
import {
  completeItemIssueReceiptWithDiscrepancyHandler,
  confirmItemIssueReceiptHandler,
  createDepartmentIssueHandler,
  getIncomingShipmentHandler,
  getItemIssueHandler,
  listDepartmentConsumptionsHandler,
  listIncomingShipmentsHandler,
  listInTransitQuantitiesHandler,
  listItemIssuesHandler,
  rejectItemIssueHandler,
  returnItemIssueHandler,
  returnItemIssueReceiptHandler,
  submitItemIssueHandler,
  submitItemIssueReceiptHandler,
  updateDepartmentIssueHandler,
  updateItemIssueHandler,
  verifyItemIssueHandler,
} from "../controllers/item-issues.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemIssuesRouter = Router();

itemIssuesRouter.use(requireAuth, requireRole("ADMIN", "MAKER", "CHECKER"));

itemIssuesRouter.get("/", listItemIssuesHandler);
itemIssuesRouter.get("/incoming", listIncomingShipmentsHandler);
itemIssuesRouter.get("/incoming/:shipmentId", getIncomingShipmentHandler);
itemIssuesRouter.post(
  "/incoming/:shipmentId/receipts",
  submitItemIssueReceiptHandler,
);
itemIssuesRouter.post("/receipts/:receiptId/confirm", confirmItemIssueReceiptHandler);
itemIssuesRouter.post(
  "/receipts/:receiptId/complete-with-discrepancy",
  completeItemIssueReceiptWithDiscrepancyHandler,
);
itemIssuesRouter.post("/receipts/:receiptId/return", returnItemIssueReceiptHandler);
itemIssuesRouter.get("/in-transit", listInTransitQuantitiesHandler);
itemIssuesRouter.get(
  "/department-consumption",
  listDepartmentConsumptionsHandler,
);
itemIssuesRouter.post("/department", createDepartmentIssueHandler);
itemIssuesRouter.patch("/department/:issueId", updateDepartmentIssueHandler);
itemIssuesRouter.get("/:issueId", getItemIssueHandler);
itemIssuesRouter.patch("/:issueId", updateItemIssueHandler);
itemIssuesRouter.post("/:issueId/submit", submitItemIssueHandler);
itemIssuesRouter.post("/:issueId/verify", verifyItemIssueHandler);
itemIssuesRouter.post("/:issueId/return", returnItemIssueHandler);
itemIssuesRouter.post("/:issueId/reject", rejectItemIssueHandler);
