export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; details?: Record<string, unknown> };

export function getApiBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL ?? null;
}

export const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "ps_session";

function readErrorPayload(json: unknown): {
  message?: string;
  details?: Record<string, unknown>;
} {
  if (
    !json ||
    typeof json !== "object" ||
    !("error" in json) ||
    !json.error ||
    typeof json.error !== "object"
  ) {
    return {};
  }

  const error = json.error as Record<string, unknown>;
  return {
    message: typeof error.message === "string" ? error.message : undefined,
    details:
      error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : undefined,
  };
}

export async function parseErrorMessage(
  response: Response,
  fallback: string,
): Promise<{ message: string; details?: Record<string, unknown> }> {
  try {
    const json: unknown = await response.json();
    const parsed = readErrorPayload(json);
    if (parsed.message) {
      return { message: parsed.message, details: parsed.details };
    }
  } catch {
    // Ignore JSON parse failures and use the fallback message.
  }

  return { message: fallback };
}

export async function requestJson<T>(
  path: string,
  options: RequestInit | undefined,
  parse: (
    json: unknown,
  ) => { success: true; data: T } | { success: false; error: string },
  fallbackError: string,
): Promise<ApiResult<T>> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "NEXT_PUBLIC_API_URL is not configured" };
  }

  try {
    const headers = new Headers(options?.headers);
    const isFormData =
      typeof FormData !== "undefined" && options?.body instanceof FormData;

    if (!isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      cache: "no-store",
      credentials: "include",
      headers,
    });

    if (!response.ok) {
      const error = await parseErrorMessage(response, fallbackError);
      return {
        ok: false,
        error: error.message,
        status: response.status,
        details: error.details,
      };
    }

    if (response.status === 204) {
      const parsed = parse(undefined);
      if (!parsed.success) {
        return { ok: false, error: parsed.error, status: response.status };
      }
      return { ok: true, data: parsed.data };
    }

    const json: unknown = await response.json();
    const parsed = parse(json);
    if (!parsed.success) {
      return { ok: false, error: parsed.error, status: response.status };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      error: "Unable to reach the API. Check that the backend is running.",
    };
  }
}
