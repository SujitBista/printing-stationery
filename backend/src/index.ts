import type { Server } from "node:http";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { closePool, createDb } from "./db/client.js";

const FORCE_SHUTDOWN_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  createDb(env);

  const app = createApp(env);
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  registerShutdownHandlers(server);
}

function registerShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`Received ${signal}. Starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, FORCE_SHUTDOWN_MS);
    forceTimer.unref();

    // Stop accepting new HTTP requests, then close the server.
    server.close(async (closeError) => {
      if (closeError) {
        console.error("Error while closing HTTP server:", closeError);
      }

      try {
        await closePool();
        console.log("PostgreSQL pool closed");
        clearTimeout(forceTimer);
        process.exit(closeError ? 1 : 0);
      } catch (poolError) {
        console.error("Error while closing PostgreSQL pool:", poolError);
        clearTimeout(forceTimer);
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
