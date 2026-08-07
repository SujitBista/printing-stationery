import { AppError } from "./errors.js";

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database is unavailable. Ensure PostgreSQL is running and DATABASE_URL is configured.";

const BRANCH_CODE_UNIQUE_INDEX = "branches_branch_code_lower_uidx";
const DEPARTMENT_CODE_UNIQUE_INDEX = "departments_department_code_lower_uidx";
const UNIT_NAME_UNIQUE_INDEX = "units_unit_name_lower_uidx";
const ITEM_GROUP_CODE_UNIQUE_INDEX = "item_groups_group_code_lower_uidx";
const ITEM_GROUP_NAME_UNIQUE_INDEX = "item_groups_group_name_lower_uidx";
const ITEM_CODE_UNIQUE_INDEX = "items_item_code_lower_uidx";
const ITEM_NAME_UNIQUE_INDEX = "items_item_name_lower_uidx";
const STORE_CODE_UNIQUE_INDEX = "stores_store_code_lower_uidx";
const STORE_BRANCH_NAME_UNIQUE_INDEX = "stores_branch_store_name_lower_uidx";

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

export function isDepartmentCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === DEPARTMENT_CODE_UNIQUE_INDEX;
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

export function mapDepartmentDatabaseError(error: unknown): never {
  if (isDepartmentCodeUniqueViolation(error)) {
    throw new AppError(
      "A department with this department code already exists",
      409,
      { cause: error },
    );
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isUnitNameUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === UNIT_NAME_UNIQUE_INDEX;
}

export function mapUnitDatabaseError(error: unknown): never {
  if (isUnitNameUniqueViolation(error)) {
    throw new AppError("A unit with this unit name already exists", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isItemGroupCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_GROUP_CODE_UNIQUE_INDEX;
}

export function isItemGroupNameUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_GROUP_NAME_UNIQUE_INDEX;
}

export function mapItemGroupDatabaseError(error: unknown): never {
  if (isItemGroupCodeUniqueViolation(error)) {
    throw new AppError("An item group with this code already exists.", 409, {
      cause: error,
    });
  }

  if (isItemGroupNameUniqueViolation(error)) {
    throw new AppError("An item group with this name already exists.", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isItemCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_CODE_UNIQUE_INDEX;
}

export function isItemNameUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_NAME_UNIQUE_INDEX;
}

export function mapItemDatabaseError(error: unknown): never {
  if (isItemCodeUniqueViolation(error)) {
    throw new AppError("An item with this code already exists.", 409, {
      cause: error,
    });
  }

  if (isItemNameUniqueViolation(error)) {
    throw new AppError("An item with this name already exists.", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isStoreCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === STORE_CODE_UNIQUE_INDEX;
}

export function isStoreBranchNameUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === STORE_BRANCH_NAME_UNIQUE_INDEX;
}

export function mapStoreDatabaseError(error: unknown): never {
  if (isStoreCodeUniqueViolation(error)) {
    throw new AppError("A store with this code already exists.", 409, {
      cause: error,
    });
  }

  if (isStoreBranchNameUniqueViolation(error)) {
    throw new AppError(
      "A store with this name already exists in the selected branch.",
      409,
      { cause: error },
    );
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function databaseUnavailableError(cause?: unknown): AppError {
  return new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause });
}
