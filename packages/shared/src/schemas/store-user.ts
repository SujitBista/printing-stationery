import { z } from "zod";
import { appRoleSchema } from "./auth.js";
import { branchTypeSchema } from "./branch.js";

export const storeUserStatusFilterSchema = z.enum([
  "ALL",
  "ACTIVE",
  "INACTIVE",
]);

export const storeUserAssignableRoleSchema = z.enum(["MAKER", "CHECKER"]);

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

export const storeUserBranchSummarySchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
  branchType: branchTypeSchema,
  isActive: z.boolean(),
});

export const storeUserStoreSummarySchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
  branch: storeUserBranchSummarySchema,
});

export const storeUserEmployeeSummarySchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  isActive: z.boolean(),
  branch: storeUserBranchSummarySchema,
});

export const storeUserPersonSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  role: appRoleSchema,
  isActive: z.boolean(),
  employee: storeUserEmployeeSummarySchema,
});

export const storeUserSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  makerApplicationUserId: z.string().uuid().nullable(),
  supervisorApplicationUserId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  store: storeUserStoreSummarySchema,
  maker: storeUserPersonSummarySchema.nullable(),
  supervisor: storeUserPersonSummarySchema.nullable(),
});

function distinctMakerAndSupervisor(
  value: {
    makerApplicationUserId: string;
    supervisorApplicationUserId: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.makerApplicationUserId === value.supervisorApplicationUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["supervisorApplicationUserId"],
      message: "Maker and Supervisor must be different accounts.",
    });
  }
}

export const createStoreUserInputSchema = z
  .object({
    storeId: z.string().uuid("Invalid store id"),
    makerApplicationUserId: z.string().uuid("Invalid maker id"),
    supervisorApplicationUserId: z.string().uuid("Invalid supervisor id"),
  })
  .strict()
  .superRefine(distinctMakerAndSupervisor);

export const updateStoreUserInputSchema = z
  .object({
    makerApplicationUserId: z.string().uuid("Invalid maker id"),
    supervisorApplicationUserId: z.string().uuid("Invalid supervisor id"),
  })
  .strict()
  .superRefine(distinctMakerAndSupervisor);

export const updateStoreUserStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const storeUserListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: storeUserStatusFilterSchema.default("ALL"),
  storeId: optionalUuidFilterSchema,
  branchId: optionalUuidFilterSchema,
});

export const paginatedStoreUserResponseSchema = z.object({
  items: z.array(storeUserSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const storeUserIdSchema = z.string().uuid("Invalid store user id");

export const eligibleStoreApplicationUserSchema = storeUserPersonSummarySchema.extend(
  {
    role: storeUserAssignableRoleSchema,
  },
);

export const eligibleStoreApplicationUserListQuerySchema = z
  .object({
    storeId: optionalUuidFilterSchema,
    branchId: optionalUuidFilterSchema,
    role: storeUserAssignableRoleSchema,
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    search: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    excludeAssignmentId: optionalUuidFilterSchema,
  })
  .superRefine((value, ctx) => {
    if (value.role === "MAKER" && !value.storeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storeId"],
        message: "Store is required to list eligible store users",
      });
    }
    if (value.role === "CHECKER" && !value.storeId && !value.branchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storeId"],
        message: "Store or branch is required to list eligible supervisors",
      });
    }
  });

export const paginatedEligibleStoreApplicationUserResponseSchema = z.object({
  items: z.array(eligibleStoreApplicationUserSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const eligibleStoreUserStoreListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const paginatedEligibleStoreUserStoreResponseSchema = z.object({
  items: z.array(storeUserStoreSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
