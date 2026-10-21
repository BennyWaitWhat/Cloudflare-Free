import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv } from "./env";
import { runsOnlyOnCloudflare } from "./lib/ai";
import { loadSession } from "./lib/session";
import { admin } from "./routes/admin";
import { ai } from "./routes/ai";
import { auth } from "./routes/auth";
import { chat } from "./routes/chat";
import { contact } from "./routes/contact";
import { images, uploads } from "./routes/media";
import { meta } from "./routes/meta";
import { posts } from "./routes/posts";
import { tools } from "./routes/tools";

export const app = new Hono<AppEnv>();

// Requests rejected before their body is read (for example "Sign in first")
// leave the body unread, which breaks the reused connection in local dev.
app.use("/api/*", async (c, next) => {
  await next();
  const request = c.req.raw;
  if (request.body && !request.bodyUsed) await request.arrayBuffer().catch(() => undefined);
});
// Security headers on every API response except the chat WebSocket's, which comes
// from the Durable Object with headers that can't be changed.
const secure = secureHeaders();
app.use("/api/*", (c, next) => (c.req.header("upgrade") ? next() : secure(c, next)));
app.use("/api/*", loadSession);
app.route("/api", meta);
app.route("/api/auth", auth);
app.route("/api/posts", posts);
app.route("/api/uploads", uploads);
app.route("/api/ai", ai);
app.route("/api/tools", tools);
app.route("/api/contact", contact);
app.route("/api/chat", chat);
app.route("/api/admin", admin);
app.route("/img", images);

/** RFC 9116 security.txt, generated for whichever host serves the site. */
app.get("/.well-known/security.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  c.header("cache-control", "public, max-age=86400");
  return c.text(
    `Contact: ${origin}/contact\nExpires: ${expires}\nPreferred-Languages: en\nPolicy: https://github.com/BennyWaitWhat/Cloudflare-Free/security/policy\nCanonical: ${origin}/.well-known/security.txt\n`,
  );
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : String(error);
  if (runsOnlyOnCloudflare(error)) {
    return c.json({ error: "This feature runs on Cloudflare's network: use `npm run dev:remote` or deploy" }, 503);
  }
  if (/daily free allocation|\b(3036|4006)\b/i.test(message)) {
    return c.json({ error: "Today's free AI budget is used up; it resets at midnight UTC" }, 429);
  }
  console.error("unhandled error", error);
  return c.json({ error: "Something went wrong on our side" }, 500);
});
