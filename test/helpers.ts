import { env, type D1Migration } from "cloudflare:test";
import { Hono } from "hono";
import type { AppEnv, Bindings } from "../src/worker/env";
import { startSession } from "../src/worker/lib/session";

/** The Worker's bindings plus the migrations that vitest.config.ts injects. */
export const bindings = env as unknown as Bindings & { TEST_MIGRATIONS: D1Migration[] };
export const ORIGIN = "https://site.test";

/** Inserts a member and returns a session cookie minted by the app's own session code. */
export async function signIn(username: string): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await bindings.DB.prepare("INSERT INTO users (id, username, display_name, webauthn_user_id) VALUES (?, ?, ?, ?)")
    .bind(userId, username, username, "test-handle")
    .run();
  const minter = new Hono<AppEnv>();
  minter.get("/", async (c) => {
    await startSession(c, userId);
    return c.text("ok");
  });
  const response = await minter.request("/", {}, bindings);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("no session cookie was set");
  return { userId, cookie };
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Answers Turnstile's siteverify with `success` and fails on any other outbound fetch. */
export function turnstileFetch(success: boolean) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) return Response.json({ success });
    throw new Error(`Unexpected outbound fetch in a test: ${url}`);
  };
}
