export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
}

/** Calls the Worker API and turns `{ error }` responses into thrown ApiErrors. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await request(path, options);
  return (await response.json()) as T;
}

/** Same as `api` but returns the raw response, for streams and images. */
export async function request(path: string, options: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  let body = options.body;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  const response = await fetch(path, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers,
    body,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Not JSON; keep the generic message.
    }
    throw new ApiError(response.status, message);
  }
  return response;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function imageUrl(key: string, width?: number): string {
  return `/img/${key}${width ? `?w=${width}` : ""}`;
}

export function timeAgo(seconds: number): string {
  const elapsed = Math.max(0, Date.now() / 1000 - seconds);
  if (elapsed < 60) return "just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
