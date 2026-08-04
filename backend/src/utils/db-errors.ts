import { AppError } from "./errors.js";

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database is unavailable. Ensure PostgreSQL is running and DATABASE_URL is configured.";

const BRANCH_CODE_UNIQUE_INDEX = "branches_branch_code_lower_uidx";

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "08000",
  "08001",
  "08003",
  "08006",
  "08004",
  "57P01",
  "57P02",
  "57P03",
]);

function readErrorProperty(
  error: unknown,
  key: "code" | "constraint",
): string | undefined {
  let current: unknown = error;

  while (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    current = record.cause;
  }

  return undefined;
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  return code !== undefined && CONNECTION_ERROR_CODES.has(code);
}

export function isBranchCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === BRANCH_CODE_UNIQUE_INDEX;
}

export function mapBranchDatabaseError(error: unknown): never {
  if (isBranchCodeUniqueViolation(error)) {
    throw new AppError("A branch with this branch code already exists", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function databaseUnavailableError(cause?: unknown): AppError {
  return new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause });
}
