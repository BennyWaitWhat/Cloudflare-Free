import type { Bindings } from "../env";
import { fail } from "./http";

/** Workers Rate Limiting binding: a cheap per-key counter local to each data center. */
export async function enforceLimit(limiter: RateLimit, key: string): Promise<void> {
  const { success } = await limiter.limit({ key });
  if (!success) fail(429, "Slow down a little and try again in a minute");
}

/** Server-side Turnstile check. Tokens are single-use and expire after 300 seconds. */
export async function verifyTurnstile(env: Bindings, token: unknown, ip: string): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) fail(503, "Turnstile isn't configured on this deployment yet");
  if (typeof token !== "string" || token.length === 0) fail(400, "Complete the human check first");

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip !== "local") form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const outcome = await response.json<{ success: boolean; "error-codes"?: string[] }>();
  if (!outcome.success) fail(403, "The human check didn't pass; please try again");
}
