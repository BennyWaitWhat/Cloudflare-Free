import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";
import type { SessionUser } from "../../shared/types";

/** Stop the request with a message the web app shows to the visitor. */
export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message });
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

/**
 * The key rate limits count by: an IPv4 address as is, an IPv6 address as its /64.
 * One home or phone usually gets a whole /64, so counting single IPv6 addresses
 * would let one visitor reset their limit by switching to the next address.
 */
export function rateKey(c: Context<AppEnv>): string {
  const ip = clientIp(c);
  if (!ip.includes(":")) return ip;
  // Expand "::" back into its zero groups, then keep the first four groups: the /64 network.
  const [head, tail = ""] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const zeros = Array(Math.max(0, 8 - front.length - back.length)).fill("0");
  const groups = ip.includes("::") ? [...front, ...zeros, ...back] : front;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().padStart(4, "0")).join(":")}::/64`;
}

export function country(c: Context<AppEnv>): string | null {
  const cf = c.req.raw.cf as { country?: string } | undefined;
  return cf?.country ?? null;
}

export async function readBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json<unknown>();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through to the error below
  }
  fail(400, "Send a JSON object");
}

export function requiredText(value: unknown, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min) fail(400, min <= 1 ? `${label} is required` : `${label} needs at least ${min} characters`);
  if (text.length > max) fail(400, `${label} can be at most ${max} characters`);
  return text;
}

export function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, 1, max);
}

export function requireUser(c: Context<AppEnv>): SessionUser {
  const user = c.get("user");
  if (!user) fail(401, "Sign in first");
  return user;
}

export function requireAdmin(c: Context<AppEnv>): SessionUser {
  const user = requireUser(c);
  if (!user.isAdmin) fail(403, "Only the site owner can do that");
  return user;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
