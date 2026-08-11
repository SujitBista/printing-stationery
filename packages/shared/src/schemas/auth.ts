import { z } from "zod";

export const appRoleSchema = z.enum(["ADMIN", "MAKER", "CHECKER"]);

export const APP_ROLES = appRoleSchema.options;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be between 3 and 100 characters")
  .max(100, "Username must be between 3 and 100 characters");

const PASSWORD_MAX_LENGTH = 128;

function hasUppercase(value: string): boolean {
  return /[A-Z]/.test(value);
}

function hasLowercase(value: string): boolean {
  return /[a-z]/.test(value);
}

function hasDigit(value: string): boolean {
  return /[0-9]/.test(value);
}

function hasSymbol(value: string): boolean {
  return /[^A-Za-z0-9]/.test(value);
}

function hasLeadingOrTrailingWhitespace(value: string): boolean {
  return /^\s|\s$/.test(value);
}

export const passwordSchema = z
  .string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a string",
  })
  .min(12, "Password must be at least 12 characters")
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  )
  .superRefine((value, ctx) => {
    if (hasLeadingOrTrailingWhitespace(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must not have leading or trailing whitespace",
      });
      return;
    }

    if (!hasUppercase(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include at least one uppercase letter",
      });
    }
    if (!hasLowercase(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include at least one lowercase letter",
      });
    }
    if (!hasDigit(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include at least one number",
      });
    }
    if (!hasSymbol(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include at least one symbol",
      });
    }
  });

export const loginInputSchema = z
  .object({
    username: usernameSchema,
    password: z
      .string({
        required_error: "Password is required",
        invalid_type_error: "Password must be a string",
      })
      .min(1, "Password is required")
      .max(PASSWORD_MAX_LENGTH, "Invalid username or password."),
  })
  .strict();

export const changeInitialPasswordInputSchema = z
  .object({
    currentPassword: z
      .string({
        required_error: "Current password is required",
        invalid_type_error: "Current password must be a string",
      })
      .min(1, "Current password is required")
      .max(PASSWORD_MAX_LENGTH, "Current password is too long"),
    newPassword: passwordSchema,
    confirmPassword: z.string({
      required_error: "Confirm password is required",
      invalid_type_error: "Confirm password must be a string",
    }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "New password and confirmation do not match",
      });
    }
  });

export const authenticatedEmployeeBranchSchema = z.object({
  id: z.string().uuid(),
  branchCode: z.string(),
  branchName: z.string(),
});

export const authenticatedEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeCode: z.string(),
  employeeName: z.string(),
  branch: authenticatedEmployeeBranchSchema,
});

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  mustChangePassword: z.boolean(),
  roles: z.array(appRoleSchema),
  /** Null for the independently bootstrapped system Admin; required for ordinary users. */
  employee: authenticatedEmployeeSchema.nullable(),
});

export const authResponseSchema = z.object({
  user: authenticatedUserSchema,
});

export function userHasRole(
  roles: ReadonlyArray<z.infer<typeof appRoleSchema>>,
  required: z.infer<typeof appRoleSchema> | ReadonlyArray<z.infer<typeof appRoleSchema>>,
): boolean {
  const requiredRoles = Array.isArray(required) ? required : [required];
  return requiredRoles.some((role) => roles.includes(role));
}

export function userHasAnyRole(
  roles: ReadonlyArray<z.infer<typeof appRoleSchema>>,
  required: ReadonlyArray<z.infer<typeof appRoleSchema>>,
): boolean {
  return required.some((role) => roles.includes(role));
}
