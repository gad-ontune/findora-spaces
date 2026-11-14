import { cookies } from "next/headers";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.BACKEND_INTERNAL_URL ??
  process.env.INTERNAL_API_URL ??
  "http://127.0.0.1:8000";

type ServerOptions = {
  auth?: boolean;
  revalidate?: number;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function withQuery(path: string, query?: ServerOptions["query"]): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const stringified = search.toString();
  return stringified ? `${path}${path.includes("?") ? "&" : "?"}${stringified}` : path;
}

export async function serverFetch<T>(
  path: string,
  options: ServerOptions = {},
): Promise<T | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.auth) {
    const cookieStore = await cookies();
    headers.Cookie = cookieStore.toString();
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1${withQuery(path, options.query)}`, {
      headers,
      cache: options.revalidate === undefined ? "no-store" : undefined,
      next: options.revalidate === undefined ? undefined : { revalidate: options.revalidate },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function requireServerUser<T>(path: string): Promise<T | null> {
  return serverFetch<T>(path, { auth: true });
}

export function serverMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : url;
}
