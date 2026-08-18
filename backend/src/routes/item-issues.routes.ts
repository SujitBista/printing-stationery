import { Router } from "express";
import {
  getItemIssueHandler,
  listItemIssuesHandler,
  submitItemIssueHandler,
  updateItemIssueHandler,
} from "../controllers/item-issues.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemIssuesRouter = Router();

itemIssuesRouter.use(requireAuth, requireRole("ADMIN", "MAKER", "CHECKER"));

itemIssuesRouter.get("/", listItemIssuesHandler);
itemIssuesRouter.get("/:issueId", getItemIssueHandler);
itemIssuesRouter.patch("/:issueId", updateItemIssueHandler);
itemIssuesRouter.post("/:issueId/submit", submitItemIssueHandler);
