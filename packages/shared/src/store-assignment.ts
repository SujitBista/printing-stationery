export const STORE_MANAGING_ROLES = ["MAKER", "CHECKER"] as const;

export type StoreManagingRole = (typeof STORE_MANAGING_ROLES)[number];

export const NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE =
  "No active store exists for this employee’s branch. Create a store first.";

export const STORE_SELECTION_REQUIRED_MESSAGE =
  "This employee’s branch has more than one active store. Select a store.";

export const STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE =
  "The selected or automatically assigned store must belong to the employee’s current branch.";

export function isStoreManagingRole(role: string): role is StoreManagingRole {
  return role === "MAKER" || role === "CHECKER";
}

export type BranchStoreOption = {
  id: string;
};

export type StoreAssignmentResolution =
  | {
      status: "NONE";
      message: typeof NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE;
    }
  | { status: "SINGLE"; storeId: string }
  | { status: "MULTIPLE"; storeId: string }
  | {
      status: "SELECTION_REQUIRED";
      message: typeof STORE_SELECTION_REQUIRED_MESSAGE;
    }
  | { status: "INVALID"; message: string };

export function resolveStoreAssignment(params: {
  activeStores: BranchStoreOption[];
  selectedStoreId?: string | null;
}): StoreAssignmentResolution {
  const selected =
    params.selectedStoreId && params.selectedStoreId.trim().length > 0
      ? params.selectedStoreId
      : null;

  if (params.activeStores.length === 0) {
    if (selected) {
      return {
        status: "INVALID",
        message: STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE,
      };
    }

    return {
      status: "NONE",
      message: NO_ACTIVE_STORE_FOR_EMPLOYEE_BRANCH_MESSAGE,
    };
  }

  const storeIds = new Set(params.activeStores.map((store) => store.id));
  if (selected && !storeIds.has(selected)) {
    return {
      status: "INVALID",
      message: STORE_MUST_MATCH_EMPLOYEE_BRANCH_MESSAGE,
    };
  }

  if (params.activeStores.length === 1) {
    return { status: "SINGLE", storeId: params.activeStores[0]!.id };
  }

  if (!selected) {
    return {
      status: "SELECTION_REQUIRED",
      message: STORE_SELECTION_REQUIRED_MESSAGE,
    };
  }

  return { status: "MULTIPLE", storeId: selected };
}
