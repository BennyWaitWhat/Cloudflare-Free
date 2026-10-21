import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
import type { SessionUser } from "../../shared/types";
import { fail } from "./http";

// Sessions are HMAC-signed cookies, so checking one costs no KV or D1 writes.
const SESSION_COOKIE = "session";
const CHALLENGE_COOKIE = "passkey_challenge";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_SECONDS = 5 * 60;

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
}

/** Admin goes by member id, which nobody can pick, rather than by a username anyone could sign up with first. */
export function toSessionUser(env: Bindings, row: UserRow): SessionUser {
  const admins = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: admins.includes(row.id),
  };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sessionSecret(env: Bindings): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    fail(503, "SESSION_SECRET isn't configured on this deployment yet");
  }
  return env.SESSION_SECRET;
}

function parse<T>(raw: string | false | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  const secret = c.env.SESSION_SECRET;
  if (secret && c.req.header("cookie")?.includes(`${SESSION_COOKIE}=`)) {
    const session = parse<{ uid: string; exp: number }>(await getSignedCookie(c, secret, SESSION_COOKIE));
    if (session && session.exp > nowSeconds()) {
      const row = await c.env.DB.prepare("SELECT id, username, display_name FROM users WHERE id = ?")
        .bind(session.uid)
        .first<UserRow>();
      if (row) c.set("user", toSessionUser(c.env, row));
    }
  }
  await next();
});

export async function startSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const value = JSON.stringify({ uid: userId, exp: nowSeconds() + SESSION_SECONDS });
  await setSignedCookie(c, SESSION_COOKIE, value, sessionSecret(c.env), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function endSession(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

interface Challenge {
  purpose: string;
  challenge: string;
}

export async function saveChallenge<T extends Challenge>(c: Context<AppEnv>, data: T): Promise<void> {
  const value = JSON.stringify({ ...data, exp: nowSeconds() + CHALLENGE_SECONDS });
  await setSignedCookie(c, CHALLENGE_COOKIE, value, sessionSecret(c.env), {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: CHALLENGE_SECONDS,
  });
}

/** Reads and clears the pending passkey challenge so it can only be used once. */
export async function takeChallenge<T extends Challenge>(c: Context<AppEnv>, purpose: T["purpose"]): Promise<T> {
  const data = parse<T & { exp: number }>(await getSignedCookie(c, sessionSecret(c.env), CHALLENGE_COOKIE));
  deleteCookie(c, CHALLENGE_COOKIE, { path: "/api/auth", secure: true });
  if (!data || data.purpose !== purpose || data.exp < nowSeconds()) {
    fail(400, "That passkey request expired; please try again");
  }
  return data;
}
