import { Router } from "express";
import {
  createItemRequestHandler,
  getItemRequestContextHandler,
  getItemRequestHandler,
  listEligibleItemRequestItemsHandler,
  listItemRequestsHandler,
  performItemRequestActionHandler,
  updateItemRequestHandler,
} from "../controllers/item-requests.controller.js";
import {
  createItemIssueFromRequestHandler,
  getItemIssueEligibilityHandler,
} from "../controllers/item-issues.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const itemRequestsRouter = Router();

const accessRoles = requireRole("ADMIN", "MAKER", "CHECKER");

itemRequestsRouter.use(requireAuth, accessRoles);

itemRequestsRouter.get("/", listItemRequestsHandler);
itemRequestsRouter.get("/context", getItemRequestContextHandler);
itemRequestsRouter.get("/eligible-items", listEligibleItemRequestItemsHandler);
itemRequestsRouter.get("/:id", getItemRequestHandler);
itemRequestsRouter.get("/:requestId/issue-eligibility", getItemIssueEligibilityHandler);
itemRequestsRouter.post("/", createItemRequestHandler);
itemRequestsRouter.patch("/:id", updateItemRequestHandler);
itemRequestsRouter.post("/:id/actions", performItemRequestActionHandler);
itemRequestsRouter.post(
  "/:requestId/item-issues",
  createItemIssueFromRequestHandler,
);
