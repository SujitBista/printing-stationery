import {
  healthResponseSchema,
  type HealthResponse,
} from "@printing-stationery/shared";

export type HealthFetchResult =
  | { ok: true; data: HealthResponse }
  | { ok: false; error: string };

export async function fetchHealth(): Promise<HealthFetchResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_API_URL is not configured",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Health check failed with status ${response.status}`,
      };
    }

    const json: unknown = await response.json();
    const parsed = healthResponseSchema.safeParse(json);

    if (!parsed.success) {
      return {
        ok: false,
        error: "Health response did not match the expected schema",
      };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      error: "Unable to reach the API health endpoint",
    };
  }
}
