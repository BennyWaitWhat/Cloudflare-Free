import { Hono } from "hono";
import type { AppEnv } from "../env";
import { fail, readBody, requireAdmin } from "../lib/http";
import { indexForSearch, POST_SELECT, toPublicPost, type PostRow } from "../lib/posts";

// Owner-only views. Once the domain is on Cloudflare, Access can add a second login wall here.
export const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

admin.get("/overview", async (c) => {
  const count = (sql: string) => c.env.DB.prepare(sql);
  const [users, published, pending, rejected, messages, inbound] = await c.env.DB.batch<{ n: number }>([
    count("SELECT COUNT(*) AS n FROM users"),
    count("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'"),
    count("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'"),
    count("SELECT COUNT(*) AS n FROM posts WHERE status = 'rejected'"),
    count("SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'"),
    count("SELECT COUNT(*) AS n FROM inbound_emails"),
  ]);
  const n = (result: D1Result<{ n: number }>) => result.results[0]?.n ?? 0;
  return c.json({
    users: n(users),
    posts: { published: n(published), pending: n(pending), rejected: n(rejected) },
    newMessages: n(messages),
    inboundEmails: n(inbound),
  });
});

admin.get("/posts", async (c) => {
  const status = c.req.query("status") === "rejected" ? "rejected" : "pending";
  const { results } = await c.env.DB.prepare(`${POST_SELECT} WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 50`)
    .bind(status)
    .all<PostRow>();
  return c.json({ posts: results.map(toPublicPost) });
});

admin.post("/posts/:id/status", async (c) => {
  const body = await readBody(c);
  const status = body.status;
  if (status !== "published" && status !== "rejected") fail(400, "Status must be published or rejected");
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "UPDATE posts SET status = ?, published_at = CASE WHEN ? = 'published' THEN unixepoch() ELSE published_at END, moderation_note = ? WHERE id = ? RETURNING kind, title, body",
  )
    .bind(status, status, status === "rejected" ? "Rejected by the site owner" : null, id)
    .first<{ kind: string; title: string | null; body: string }>();
  if (!row) fail(404, "Post not found");
  // A post the owner publishes by hand never reached the Workflow's search step, so index it here.
  if (status === "published") {
    const text = [row.title, row.body].filter(Boolean).join("\n\n");
    c.executionCtx.waitUntil(indexForSearch(c.env, id, row.kind, text));
  }
  return c.json({ ok: true });
});

admin.get("/messages", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, message, country, status, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 50",
  ).all();
  return c.json({ messages: results });
});

admin.post("/messages/:id/status", async (c) => {
  const body = await readBody(c);
  const status = body.status;
  if (status !== "new" && status !== "read" && status !== "archived") fail(400, "Status must be new, read or archived");
  await c.env.DB.prepare("UPDATE contact_messages SET status = ? WHERE id = ?").bind(status, c.req.param("id")).run();
  return c.json({ ok: true });
});

admin.get("/inbox", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, from_addr, to_addr, subject, text_body, received_at FROM inbound_emails ORDER BY received_at DESC LIMIT 50",
  ).all();
  return c.json({ emails: results });
});
