import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { branchesRouter } from "./routes/branches.routes.js";
import { departmentsRouter } from "./routes/departments.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { unitsRouter } from "./routes/units.routes.js";

const FRONTEND_ORIGIN = "http://localhost:3000";

export function createApp(_env: Env) {
  const app = express();

  app.use(helmet());
  // CORS is restricted to the Next.js frontend origin.
  // Unrestricted CORS is intentionally not enabled, including in development.
  app.use(
    cors({
      origin: FRONTEND_ORIGIN,
    }),
  );
  app.use(express.json());

  app.use("/api/health", healthRouter);
  // TODO: Restrict Branch Setup to an administrative permission once authentication is implemented.
  app.use("/api/branches", branchesRouter);
  // TODO: Restrict Department Setup to an administrative permission once authentication is implemented.
  app.use("/api/departments", departmentsRouter);
  // TODO: Restrict Unit Setup to an administrative permission once authentication is implemented.
  app.use("/api/units", unitsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
