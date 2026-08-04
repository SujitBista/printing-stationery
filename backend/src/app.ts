import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.routes.js";

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
