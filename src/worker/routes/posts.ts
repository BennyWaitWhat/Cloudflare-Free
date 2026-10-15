import { Hono } from "hono";
import type { AppEnv } from "../env";
import { track } from "../lib/analytics";
import { enforceLimit, verifyTurnstile } from "../lib/guards";
import { clientIp, country, fail, optionalText, readBody, requiredText, requireUser } from "../lib/http";
import { POST_SELECT, toPublicPost, type PostRow } from "../lib/posts";

export const posts = new Hono<AppEnv>();

const PAGE_SIZE = 20;

posts.get("/", async (c) => {
  const kind = c.req.query("kind") === "blog" ? "blog" : "community";
  const before = Number(c.req.query("before")) || Math.floor(Date.now() / 1000) + 1;
  const { results } = await c.env.DB.prepare(
    `${POST_SELECT} WHERE p.kind = ? AND p.status = 'published' AND p.created_at < ? ORDER BY p.created_at DESC LIMIT ?`,
  )
    .bind(kind, before, PAGE_SIZE)
    .all<PostRow>();
  const last = results.at(-1);
  return c.json({
    posts: results.map(toPublicPost),
    nextBefore: results.length === PAGE_SIZE && last ? last.created_at : null,
  });
});

posts.get("/mine", async (c) => {
  const user = requireUser(c);
  const { results } = await c.env.DB.prepare(`${POST_SELECT} WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 20`)
    .bind(user.id)
    .all<PostRow>();
  return c.json({ posts: results.map(toPublicPost) });
});

posts.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`${POST_SELECT} WHERE p.id = ?`).bind(c.req.param("id")).first<PostRow>();
  const user = c.get("user");
  if (!row) fail(404, "Post not found");
  const isAuthor = user?.username === row.username;
  if (row.status !== "published" && !isAuthor && !user?.isAdmin) fail(404, "Post not found");
  return c.json({ post: toPublicPost(row) });
});

posts.post("/", async (c) => {
  const user = requireUser(c);
  const body = await readBody(c);
  const kind = body.kind === "blog" ? "blog" : "community";
  if (kind === "blog" && !user.isAdmin) fail(403, "Only the site owner can write blog posts");
  const title = optionalText(body.title, "Title", 140);
  const text = requiredText(body.body, "Post", 1, 5000);
  const imageKey = typeof body.imageKey === "string" && body.imageKey ? body.imageKey : null;

  await enforceLimit(c.env.WRITE_LIMITER, `post:${user.id}`);
  await verifyTurnstile(c.env, body.turnstileToken, clientIp(c));
  if (imageKey) {
    const owned = await c.env.DB.prepare("SELECT 1 FROM uploads WHERE key = ? AND owner_id = ?").bind(imageKey, user.id).first();
    if (!owned) fail(400, "That upload wasn't found");
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO posts (id, author_id, kind, title, body, image_key) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, kind, title, text, imageKey)
    .run();

  // Moderation, alt text, search indexing and publishing run as a durable Workflow.
  try {
    await c.env.MODERATE_POST.create({ id, params: { postId: id } });
  } catch (error) {
    console.error("could not start moderation workflow; the post stays pending for the admin", error);
  }
  track(c.env, "post_created", { detail: kind, userId: user.id, country: country(c) });
  return c.json({ post: { id, status: "pending" } }, 202);
});
