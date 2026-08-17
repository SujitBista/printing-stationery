import { Router } from "express";
import {
  createStoreUserHandler,
  getStoreUserHandler,
  listEligibleStoreApplicationUsersHandler,
  listEligibleStoresHandler,
  listStoreUsersHandler,
  updateStoreUserHandler,
  updateStoreUserStatusHandler,
} from "../controllers/store-users.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const storeUsersRouter = Router();

const adminOnly = requireRole("ADMIN");

storeUsersRouter.get("/", requireAuth, adminOnly, listStoreUsersHandler);
storeUsersRouter.get(
  "/eligible-stores",
  requireAuth,
  adminOnly,
  listEligibleStoresHandler,
);
storeUsersRouter.get(
  "/eligible-application-users",
  requireAuth,
  adminOnly,
  listEligibleStoreApplicationUsersHandler,
);
storeUsersRouter.get("/:id", requireAuth, adminOnly, getStoreUserHandler);
storeUsersRouter.post("/", requireAuth, adminOnly, createStoreUserHandler);
storeUsersRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateStoreUserStatusHandler,
);
storeUsersRouter.patch("/:id", requireAuth, adminOnly, updateStoreUserHandler);
