import { Hono } from "hono";
import type { AppEnv, JobMessage } from "../env";
import { track } from "../lib/analytics";
import { enforceLimit, verifyTurnstile } from "../lib/guards";
import { clientIp, country, fail, readBody, requiredText } from "../lib/http";

export const contact = new Hono<AppEnv>();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form is accepted right away; a Queue consumer stores it and notifies the owner. */
contact.post("/", async (c) => {
  const body = await readBody(c);
  const name = requiredText(body.name, "Name", 1, 80);
  const email = requiredText(body.email, "Email", 3, 254);
  if (!EMAIL.test(email)) fail(400, "Enter a valid email address");
  const message = requiredText(body.message, "Message", 5, 4000);
  const ip = clientIp(c);
  await enforceLimit(c.env.WRITE_LIMITER, `contact:${ip}`);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const job: JobMessage = {
    type: "contact",
    id: crypto.randomUUID(),
    name,
    email,
    message,
    country: country(c),
    at: Math.floor(Date.now() / 1000),
  };
  await c.env.JOBS.send(job);
  track(c.env, "contact_sent", { country: job.country });
  return c.json({ ok: true }, 202);
});
