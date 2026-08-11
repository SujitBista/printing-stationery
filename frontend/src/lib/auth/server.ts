import {
  authResponseSchema,
  type AuthenticatedUser,
} from "@printing-stationery/shared";
import { cookies } from "next/headers";
import { getApiBaseUrl, SESSION_COOKIE_NAME } from "@/lib/api/client";

export async function fetchCurrentUserServer(): Promise<AuthenticatedUser | null> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const json: unknown = await response.json();
    const parsed = authResponseSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }

    return parsed.data.user;
  } catch {
    return null;
  }
}
