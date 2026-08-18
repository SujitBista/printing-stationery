import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { attachEnv } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { applicationUsersRouter } from "./routes/application-users.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { branchesRouter } from "./routes/branches.routes.js";
import { departmentsRouter } from "./routes/departments.routes.js";
import { employeesRouter } from "./routes/employees.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { itemGroupsRouter } from "./routes/item-groups.routes.js";
import { itemRequestsRouter } from "./routes/item-requests.routes.js";
import { itemsRouter } from "./routes/items.routes.js";
import { storesRouter } from "./routes/stores.routes.js";
import { storeUsersRouter } from "./routes/store-users.routes.js";
import { unitsRouter } from "./routes/units.routes.js";

export function createApp(env: Env) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  // CORS is restricted to the configured frontend origin with credentials.
  // Wildcard origins are intentionally not allowed with credentialed cookies.
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(attachEnv(env));
  app.use(csrfProtection(env));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/application-users", applicationUsersRouter);
  app.use("/api/branches", branchesRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/units", unitsRouter);
  app.use("/api/item-groups", itemGroupsRouter);
  app.use("/api/items", itemsRouter);
  app.use("/api/item-requests", itemRequestsRouter);
  app.use("/api/stores", storesRouter);
  app.use("/api/store-users", storeUsersRouter);
  app.use("/api/employees", employeesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
