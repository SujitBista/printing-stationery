import { z } from "zod";

const DEFAULT_SESSION_DURATION_HOURS = 8;
const DEFAULT_SESSION_COOKIE_NAME = "ps_session";
const DEFAULT_FRONTEND_ORIGIN = "http://localhost:3000";
const DEFAULT_LAST_SEEN_THROTTLE_SECONDS = 300;

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid environment configuration: ${name} must be a positive integer`,
    );
  }

  return parsed;
}

function parseCookieSecure(
  value: string | undefined,
  nodeEnv: "development" | "test" | "production",
): boolean {
  if (value === undefined || value.trim() === "") {
    return nodeEnv === "production";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(
    "Invalid environment configuration: COOKIE_SECURE must be true or false",
  );
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_ORIGIN: z
    .string()
    .url("FRONTEND_ORIGIN must be a valid URL")
    .default(DEFAULT_FRONTEND_ORIGIN),
  SESSION_COOKIE_NAME: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .default(DEFAULT_SESSION_COOKIE_NAME),
  SESSION_DURATION_HOURS: z.number().int().positive(),
  COOKIE_SECURE: z.boolean(),
  SESSION_LAST_SEEN_THROTTLE_SECONDS: z.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnvResult = z
    .enum(["development", "test", "production"])
    .default("development")
    .safeParse(raw.NODE_ENV);

  if (!nodeEnvResult.success) {
    throw new Error(
      "Invalid environment configuration: NODE_ENV must be development, test, or production",
    );
  }

  const parsed = envSchema.safeParse({
    NODE_ENV: nodeEnvResult.data,
    PORT: raw.PORT,
    DATABASE_URL: raw.DATABASE_URL,
    FRONTEND_ORIGIN: raw.FRONTEND_ORIGIN,
    SESSION_COOKIE_NAME: raw.SESSION_COOKIE_NAME,
    SESSION_DURATION_HOURS: parsePositiveInt(
      raw.SESSION_DURATION_HOURS,
      DEFAULT_SESSION_DURATION_HOURS,
      "SESSION_DURATION_HOURS",
    ),
    COOKIE_SECURE: parseCookieSecure(raw.COOKIE_SECURE, nodeEnvResult.data),
    SESSION_LAST_SEEN_THROTTLE_SECONDS: parsePositiveInt(
      raw.SESSION_LAST_SEEN_THROTTLE_SECONDS,
      DEFAULT_LAST_SEEN_THROTTLE_SECONDS,
      "SESSION_LAST_SEEN_THROTTLE_SECONDS",
    ),
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
