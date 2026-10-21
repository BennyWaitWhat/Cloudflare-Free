import { Hono, type Context } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AppEnv } from "../env";
import { track } from "../lib/analytics";
import { fromBase64Url, toBase64Url } from "../lib/encoding";
import { enforceLimit, verifyTurnstile } from "../lib/guards";
import { clientIp, country, fail, rateKey, readBody, requiredText } from "../lib/http";
import { endSession, saveChallenge, startSession, takeChallenge, toSessionUser } from "../lib/session";

// Passkeys (WebAuthn): verifying a signature is cheap enough for the Free
// plan's 10 ms CPU limit, unlike password hashing, and stores no secrets.
export const auth = new Hono<AppEnv>();

const USERNAME = /^[a-z0-9_]{3,24}$/;

interface RegisterChallenge {
  purpose: "register";
  challenge: string;
  userId: string;
  username: string;
  displayName: string;
  webauthnUserId: string;
}

interface LoginChallenge {
  purpose: "login";
  challenge: string;
}

interface CredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}

/** The relying party is whichever host served the request: workers.dev now, your domain later. */
function relyingParty(c: Context<AppEnv>) {
  const url = new URL(c.req.url);
  return { rpID: url.hostname, origin: url.origin };
}

auth.get("/me", (c) => c.json({ user: c.get("user") }));

auth.post("/register/options", async (c) => {
  const body = await readBody(c);
  const username = requiredText(body.username, "Username", 3, 24).toLowerCase();
  if (!USERNAME.test(username)) fail(400, "Usernames use 3-24 characters: a-z, 0-9 and _");
  const displayName = requiredText(body.displayName || username, "Display name", 1, 40);
  await enforceLimit(c.env.WRITE_LIMITER, `register:${rateKey(c)}`);
  await verifyTurnstile(c.env, body.turnstileToken, clientIp(c));

  const taken = await c.env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
  if (taken) fail(409, "That username is taken");

  const webauthnUserId = crypto.getRandomValues(new Uint8Array(32));
  const options = await generateRegistrationOptions({
    rpName: c.env.SITE_NAME,
    rpID: relyingParty(c).rpID,
    userName: username,
    userDisplayName: displayName,
    userID: webauthnUserId,
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(c, {
    purpose: "register",
    challenge: options.challenge,
    userId: crypto.randomUUID(),
    username,
    displayName,
    webauthnUserId: toBase64Url(webauthnUserId),
  } satisfies RegisterChallenge);
  return c.json(options);
});

auth.post("/register/verify", async (c) => {
  const pending = await takeChallenge<RegisterChallenge>(c, "register");
  const body = await readBody(c);
  const { rpID, origin } = relyingParty(c);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    console.warn("passkey registration rejected", error);
    fail(400, "That passkey couldn't be verified");
  }
  if (!verification.verified) fail(400, "That passkey couldn't be verified");

  const { credential } = verification.registrationInfo;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users (id, username, display_name, webauthn_user_id) VALUES (?, ?, ?, ?)").bind(
        pending.userId,
        pending.username,
        pending.displayName,
        pending.webauthnUserId,
      ),
      c.env.DB.prepare(
        "INSERT INTO credentials (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
      ).bind(
        credential.id,
        pending.userId,
        toBase64Url(credential.publicKey),
        credential.counter,
        JSON.stringify(credential.transports ?? []),
      ),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) fail(409, "That username was just taken; pick another");
    throw error;
  }

  await startSession(c, pending.userId);
  track(c.env, "signup", { userId: pending.userId, country: country(c) });
  const user = toSessionUser(c.env, {
    id: pending.userId,
    username: pending.username,
    display_name: pending.displayName,
  });
  return c.json({ user }, 201);
});

auth.post("/login/options", async (c) => {
  await enforceLimit(c.env.WRITE_LIMITER, `login:${rateKey(c)}`);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(c).rpID,
    userVerification: "preferred",
  });
  await saveChallenge(c, { purpose: "login", challenge: options.challenge } satisfies LoginChallenge);
  return c.json(options);
});

auth.post("/login/verify", async (c) => {
  const pending = await takeChallenge<LoginChallenge>(c, "login");
  const body = await readBody(c);
  const response = body.response as AuthenticationResponseJSON | undefined;
  if (!response?.id) fail(400, "Missing passkey response");

  const row = await c.env.DB.prepare("SELECT id, user_id, public_key, counter, transports FROM credentials WHERE id = ?")
    .bind(response.id)
    .first<CredentialRow>();
  if (!row) fail(401, "That passkey isn't registered on this site");

  const { rpID, origin } = relyingParty(c);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: row.id,
        publicKey: fromBase64Url(row.public_key),
        counter: row.counter,
        transports: JSON.parse(row.transports ?? "[]") as string[],
      },
      requireUserVerification: false,
    });
  } catch (error) {
    console.warn("passkey sign-in rejected", error);
    fail(401, "That passkey couldn't be verified");
  }
  if (!verification.verified) fail(401, "That passkey couldn't be verified");

  await c.env.DB.prepare("UPDATE credentials SET counter = ?, last_used_at = unixepoch() WHERE id = ?")
    .bind(verification.authenticationInfo.newCounter, row.id)
    .run();
  const userRow = await c.env.DB.prepare("SELECT id, username, display_name FROM users WHERE id = ?")
    .bind(row.user_id)
    .first<{ id: string; username: string; display_name: string }>();
  if (!userRow) fail(401, "That account no longer exists");

  await startSession(c, row.user_id);
  track(c.env, "login", { userId: row.user_id, country: country(c) });
  return c.json({ user: toSessionUser(c.env, userRow) });
});

auth.post("/logout", (c) => {
  endSession(c);
  return c.json({ ok: true });
});
