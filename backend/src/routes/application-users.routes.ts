import { Router } from "express";
import {
  createApplicationUserHandler,
  getApplicationUserHandler,
  listApplicationUsersHandler,
  listEligibleEmployeesHandler,
  resetApplicationUserPasswordHandler,
  updateApplicationUserHandler,
  updateApplicationUserStatusHandler,
} from "../controllers/application-users.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const applicationUsersRouter = Router();

const adminOnly = requireRole("ADMIN");

applicationUsersRouter.get(
  "/",
  requireAuth,
  adminOnly,
  listApplicationUsersHandler,
);
applicationUsersRouter.get(
  "/eligible-employees",
  requireAuth,
  adminOnly,
  listEligibleEmployeesHandler,
);
applicationUsersRouter.get(
  "/:id",
  requireAuth,
  adminOnly,
  getApplicationUserHandler,
);
applicationUsersRouter.post(
  "/",
  requireAuth,
  adminOnly,
  createApplicationUserHandler,
);
applicationUsersRouter.patch(
  "/:id/status",
  requireAuth,
  adminOnly,
  updateApplicationUserStatusHandler,
);
applicationUsersRouter.post(
  "/:id/reset-password",
  requireAuth,
  adminOnly,
  resetApplicationUserPasswordHandler,
);
applicationUsersRouter.patch(
  "/:id",
  requireAuth,
  adminOnly,
  updateApplicationUserHandler,
);
