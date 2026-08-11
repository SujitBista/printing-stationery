import {
  authResponseSchema,
  changeInitialPasswordInputSchema,
  loginInputSchema,
  type AuthResponse,
  type AuthenticatedUser,
  type ChangeInitialPasswordInput,
  type LoginInput,
} from "@printing-stationery/shared";
import { requestJson, type ApiResult } from "./client";

export type { ApiResult };

export async function login(
  input: LoginInput,
): Promise<ApiResult<AuthResponse>> {
  const parsedInput = loginInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid login input",
      status: 400,
    };
  }

  return requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = authResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Login response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Invalid username or password.",
  );
}

export async function logout(): Promise<ApiResult<{ ok: true }>> {
  return requestJson(
    "/api/auth/logout",
    { method: "POST", body: "{}" },
    () => ({ success: true, data: { ok: true as const } }),
    "Failed to log out",
  );
}

export async function fetchCurrentUser(): Promise<ApiResult<AuthenticatedUser>> {
  return requestJson(
    "/api/auth/me",
    { method: "GET" },
    (json) => {
      const parsed = authResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Current user response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data.user };
    },
    "Unauthorized",
  );
}

export async function changeInitialPassword(
  input: ChangeInitialPasswordInput,
): Promise<ApiResult<AuthResponse>> {
  const parsedInput = changeInitialPasswordInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Invalid password change input",
      status: 400,
    };
  }

  return requestJson(
    "/api/auth/change-initial-password",
    {
      method: "POST",
      body: JSON.stringify(parsedInput.data),
    },
    (json) => {
      const parsed = authResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          success: false,
          error: "Password change response did not match the expected schema",
        };
      }
      return { success: true, data: parsed.data };
    },
    "Failed to change password",
  );
}
