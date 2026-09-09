import { userHasRole, type AuthenticatedUser } from "@printing-stationery/shared";

export const UNLINKED_EMPLOYEE_MESSAGE =
  "Your account is not linked to an employee record.";
export const UNAUTHORIZED_REQUESTED_BY_MESSAGE =
  "You can create a request only for your own employee record.";
export const REQUESTED_BY_REQUIRED_MESSAGE = "Requested By is required.";
export const INACTIVE_REQUESTED_BY_MESSAGE =
  "The selected employee is inactive.";
export const UNKNOWN_REQUESTED_BY_MESSAGE =
  "The selected employee was not found.";

export type RequestedByEmployeeSummary = {
  id: string;
  employeeCode: string;
  employeeName: string;
  isActive: boolean;
  branch: {
    id: string;
    branchCode: string;
    branchName: string;
    isActive: boolean;
  };
  /**
   * Employees are not linked to departments in this system.
   * Kept explicit so the UI can show “No department assigned”.
   */
  department: {
    id: string;
    departmentCode: string;
    departmentName: string;
    isActive: boolean;
  } | null;
};

export function canSelectRequestedByEmployee(
  actor: Pick<AuthenticatedUser, "roles">,
): boolean {
  return userHasRole(actor.roles, "ADMIN");
}

/**
 * Resolves which employee ID may be stored as Requested By.
 * Admin may choose any employee id. Other users must use their linked
 * employee and cannot override it from the request body.
 */
export function resolveRequestedByEmployeeId(params: {
  actor: Pick<AuthenticatedUser, "roles" | "employee">;
  requestedByEmployeeId: string | undefined;
}):
  | { ok: true; employeeId: string }
  | { ok: false; status: 400 | 403; message: string } {
  const ownEmployeeId = params.actor.employee?.id ?? null;

  if (canSelectRequestedByEmployee(params.actor)) {
    if (!params.requestedByEmployeeId) {
      return { ok: false, status: 400, message: REQUESTED_BY_REQUIRED_MESSAGE };
    }
    return { ok: true, employeeId: params.requestedByEmployeeId };
  }

  if (!ownEmployeeId) {
    return { ok: false, status: 400, message: UNLINKED_EMPLOYEE_MESSAGE };
  }

  if (
    params.requestedByEmployeeId &&
    params.requestedByEmployeeId !== ownEmployeeId
  ) {
    return { ok: false, status: 403, message: UNAUTHORIZED_REQUESTED_BY_MESSAGE };
  }

  return { ok: true, employeeId: ownEmployeeId };
}

export function toRequestedByEmployeeSummary(
  employee:
    | {
        id: string;
        employeeCode: string;
        employeeName: string;
        isActive: boolean;
      }
    | null
    | undefined,
  branch:
    | {
        id: string;
        branchCode: string;
        branchName: string;
        isActive: boolean;
      }
    | null
    | undefined,
): RequestedByEmployeeSummary | null {
  if (!employee || !branch) {
    return null;
  }

  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    isActive: employee.isActive,
    branch: {
      id: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.branchName,
      isActive: branch.isActive,
    },
    department: null,
  };
}
