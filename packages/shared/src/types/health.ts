import type { z } from "zod";
import type { healthResponseSchema } from "../schemas/health.js";

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type HealthStatus = HealthResponse["status"];
export type DatabaseStatus = HealthResponse["database"];
