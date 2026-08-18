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
const EMPLOYEE_CODE_UNIQUE_INDEX = "employees_employee_code_lower_uidx";
const APPLICATION_USER_EMPLOYEE_UNIQUE_INDEX =
  "application_users_employee_id_uidx";
const APPLICATION_USER_USERNAME_UNIQUE_INDEX =
  "application_users_username_lower_uidx";
const STORE_USER_STORE_UNIQUE_INDEX = "store_users_store_id_uidx";
const STORE_USER_ACTIVE_MAKER_UNIQUE_INDEX =
  "store_users_active_maker_application_user_id_uidx";
const STORE_USER_MAKER_NE_SUPERVISOR_CHECK =
  "store_users_maker_ne_supervisor";
const ITEM_REQUEST_NUMBER_UNIQUE_INDEX = "item_requests_request_number_uidx";
const ITEM_REQUEST_LINE_ITEM_UNIQUE_INDEX =
  "item_request_lines_request_item_uidx";
const ITEM_REQUEST_LINE_QUANTITY_CHECK =
  "item_request_lines_requested_quantity_positive";

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

export function isEmployeeCodeUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === EMPLOYEE_CODE_UNIQUE_INDEX;
}

export function mapEmployeeDatabaseError(error: unknown): never {
  if (isEmployeeCodeUniqueViolation(error)) {
    throw new AppError("An employee with this code already exists.", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isApplicationUserEmployeeUniqueViolation(
  error: unknown,
): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === APPLICATION_USER_EMPLOYEE_UNIQUE_INDEX;
}

export function isApplicationUserUsernameUniqueViolation(
  error: unknown,
): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === APPLICATION_USER_USERNAME_UNIQUE_INDEX;
}

export function mapApplicationUserDatabaseError(error: unknown): never {
  if (isApplicationUserEmployeeUniqueViolation(error)) {
    throw new AppError(
      "This employee already has an application account.",
      409,
      { cause: error },
    );
  }

  if (isApplicationUserUsernameUniqueViolation(error)) {
    throw new AppError("A user with this username already exists.", 409, {
      cause: error,
    });
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isStoreUserStoreUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === STORE_USER_STORE_UNIQUE_INDEX;
}

export function isStoreUserActiveMakerUniqueViolation(
  error: unknown,
): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === STORE_USER_ACTIVE_MAKER_UNIQUE_INDEX;
}

export function isStoreUserMakerSupervisorCheckViolation(
  error: unknown,
): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23514") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === STORE_USER_MAKER_NE_SUPERVISOR_CHECK;
}

export function mapStoreUserDatabaseError(error: unknown): never {
  if (isStoreUserStoreUniqueViolation(error)) {
    throw new AppError("This store already has a user configuration.", 409, {
      cause: error,
    });
  }

  if (isStoreUserActiveMakerUniqueViolation(error)) {
    throw new AppError(
      "This maker is already assigned to another active store.",
      409,
      { cause: error },
    );
  }

  if (isStoreUserMakerSupervisorCheckViolation(error)) {
    throw new AppError(
      "Maker and Supervisor must be different accounts.",
      400,
      { cause: error },
    );
  }

  if (isDatabaseUnavailableError(error)) {
    throw new AppError(DATABASE_UNAVAILABLE_MESSAGE, 503, { cause: error });
  }

  throw error;
}

export function isItemRequestNumberUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_REQUEST_NUMBER_UNIQUE_INDEX;
}

export function isItemRequestLineItemUniqueViolation(error: unknown): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23505") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_REQUEST_LINE_ITEM_UNIQUE_INDEX;
}

export function isItemRequestLineQuantityCheckViolation(
  error: unknown,
): boolean {
  const code = readErrorProperty(error, "code");
  if (code !== "23514") {
    return false;
  }

  const constraint = readErrorProperty(error, "constraint");
  return constraint === ITEM_REQUEST_LINE_QUANTITY_CHECK;
}

export function mapItemRequestDatabaseError(error: unknown): never {
  if (isItemRequestNumberUniqueViolation(error)) {
    throw new AppError("A request with this number already exists.", 409, {
      cause: error,
    });
  }

  if (isItemRequestLineItemUniqueViolation(error)) {
    throw new AppError(
      "The same item cannot appear twice in one request",
      409,
      { cause: error },
    );
  }

  if (isItemRequestLineQuantityCheckViolation(error)) {
    throw new AppError("Requested quantity must be greater than zero", 400, {
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
