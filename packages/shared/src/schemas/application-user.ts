import { z } from "zod";
import { appRoleSchema, passwordSchema, usernameSchema } from "./auth.js";
import { employeeBranchSummarySchema, employeeSchema } from "./employee.js";

export const applicationUserStatusFilterSchema = z.enum([
  "ALL",
  "ACTIVE",
  "INACTIVE",
]);

const optionalUuidFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  z.string().uuid().optional(),
);

const optionalNullableUuidSchema = z.preprocess(
  (value) => {
    if (value === "" || value === undefined || value === null) {
      return null;
    }
    return value;
  },
  z.string().uuid("Invalid store id").nullable(),
);

const optionalRoleFilterSchema = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  },
  appRoleSchema.optional(),
);

export const applicationUserEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  branchId: z.string().uuid(),
  isActive: z.boolean(),
  branch: employeeBranchSummarySchema,
});

export const applicationUserAssignedStoreSchema = z.object({
  id: z.string().uuid(),
  storeCode: z.string(),
  storeName: z.string(),
  isActive: z.boolean(),
});

export const applicationUserSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  username: z.string(),
  role: appRoleSchema,
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  employee: applicationUserEmployeeSchema,
  assignedStore: applicationUserAssignedStoreSchema.nullable(),
});

function confirmTemporaryPassword(
  value: { temporaryPassword: string; confirmTemporaryPassword: string },
  ctx: z.RefinementCtx,
): void {
  if (value.temporaryPassword !== value.confirmTemporaryPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmTemporaryPassword"],
      message: "Temporary password and confirmation do not match",
    });
  }
}

export const createApplicationUserInputSchema = z
  .object({
    employeeId: z.string().uuid("Invalid employee id"),
    username: usernameSchema,
    role: appRoleSchema,
    temporaryPassword: passwordSchema,
    confirmTemporaryPassword: z.string({
      required_error: "Confirm temporary password is required",
      invalid_type_error: "Confirm temporary password must be a string",
    }),
    storeId: optionalNullableUuidSchema.optional().default(null),
  })
  .strict()
  .superRefine(confirmTemporaryPassword);

export const updateApplicationUserInputSchema = z
  .object({
    username: usernameSchema,
    role: appRoleSchema,
    storeId: optionalNullableUuidSchema.optional().default(null),
  })
  .strict();

export const updateApplicationUserStatusInputSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const resetApplicationUserPasswordInputSchema = z
  .object({
    temporaryPassword: passwordSchema,
    confirmTemporaryPassword: z.string({
      required_error: "Confirm temporary password is required",
      invalid_type_error: "Confirm temporary password must be a string",
    }),
  })
  .strict()
  .superRefine(confirmTemporaryPassword);

export const applicationUserListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  status: applicationUserStatusFilterSchema.default("ALL"),
  role: optionalRoleFilterSchema,
  branchId: optionalUuidFilterSchema,
});

export const paginatedApplicationUserResponseSchema = z.object({
  items: z.array(applicationUserSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const applicationUserIdSchema = z
  .string()
  .uuid("Invalid application user id");

export const eligibleEmployeeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const paginatedEligibleEmployeeResponseSchema = z.object({
  items: z.array(employeeSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
