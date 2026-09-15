import { Router } from "express";
import {
  getItemIssueHandler,
  listItemIssuesHandler,
  rejectItemIssueHandler,
  returnItemIssueHandler,
  submitItemIssueHandler,
  updateItemIssueHandler,
  verifyItemIssueHandler,
} from "../controllers/item-issues.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemIssuesRouter = Router();

itemIssuesRouter.use(requireAuth, requireRole("ADMIN", "MAKER", "CHECKER"));

itemIssuesRouter.get("/", listItemIssuesHandler);
itemIssuesRouter.get("/:issueId", getItemIssueHandler);
itemIssuesRouter.patch("/:issueId", updateItemIssueHandler);
itemIssuesRouter.post("/:issueId/submit", submitItemIssueHandler);
itemIssuesRouter.post("/:issueId/verify", verifyItemIssueHandler);
itemIssuesRouter.post("/:issueId/return", returnItemIssueHandler);
itemIssuesRouter.post("/:issueId/reject", rejectItemIssueHandler);
