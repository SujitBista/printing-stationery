import type { z } from "zod";
import type {
  appRoleSchema,
  authenticatedUserSchema,
  authResponseSchema,
  changeInitialPasswordInputSchema,
  loginInputSchema,
  passwordSchema,
} from "../schemas/auth.js";

export type AppRole = z.infer<typeof appRoleSchema>;
export type Password = z.infer<typeof passwordSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChangeInitialPasswordInput = z.infer<
  typeof changeInitialPasswordInputSchema
>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
