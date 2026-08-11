import { Router } from "express";
import {
  changeInitialPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/logout", logoutHandler);
authRouter.get("/me", meHandler);
authRouter.post(
  "/change-initial-password",
  requireAuth,
  changeInitialPasswordHandler,
);
