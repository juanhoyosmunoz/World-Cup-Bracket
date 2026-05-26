import { DEMO_MODE } from "./lib/demo";

export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";

export const ALLOWED_EMAIL_DOMAIN =
  (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string) ?? "antenna.live";

export const ADMIN_EMAILS = (
  (import.meta.env.VITE_ADMIN_EMAILS as string) ?? ""
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export { DEMO_MODE };
