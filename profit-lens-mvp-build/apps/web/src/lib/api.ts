const API_URL: string = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch wrapper that attaches a fresh App Bridge session token
 * (Authorization: Bearer <jwt>) to every request.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (window.shopify) {
    const token = await window.shopify.idToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Non-JSON error body; keep default message.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

/** SWR-compatible fetcher. */
export const swrFetcher = <T>(path: string): Promise<T> => apiFetch<T>(path);
