export const API_BASE_URL = "https://cart-sense-zsxe.onrender.com";

export type ApiError = { error?: string; message?: string };

const AUTH_INVALID_EVENT = "cartsense:auth-invalid";
const MEMBERSHIP_REVOKED_EVENT = "cartsense:membership-revoked";

function emitClientAuthEvent(name: string, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

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

    if (res.status === 401) {
      emitClientAuthEvent(AUTH_INVALID_EVENT, { path, status: res.status, message });
    }

    if (
      res.status === 403 &&
      /not a member of that household|only the household owner can remove members/i.test(message)
    ) {
      emitClientAuthEvent(MEMBERSHIP_REVOKED_EVENT, { path, status: res.status, message });
    }

    throw new Error(message);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
