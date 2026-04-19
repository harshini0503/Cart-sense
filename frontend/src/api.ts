export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? String(import.meta.env.VITE_API_BASE_URL)
  : "http://localhost:5000";

export type ApiError = { error?: string; message?: string };

export async function apiFetch<T>(path: string, opts?: RequestInit & { token?: string }): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string> | undefined),
  };

  const token = opts?.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    let payload: ApiError | undefined;
    try {
      payload = (await res.json()) as ApiError;
    } catch {
      payload = undefined;
    }
    const message =
      payload?.error || payload?.message || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  // Some endpoints may return empty body.
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

