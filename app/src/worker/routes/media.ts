import { Hono } from "hono";
import type { AppEnv } from "../env";
import { IMAGE_WIDTHS } from "../../shared/types";
import { track } from "../lib/analytics";
import { enforceLimit } from "../lib/guards";
import { country, fail, requireUser } from "../lib/http";
import { loadSession } from "../lib/session";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Per member over the last 24 hours, so nobody can fill the free 10 GB of R2. */
const DAILY_UPLOADS = 20;
const DAILY_UPLOAD_BYTES = 50 * 1024 * 1024;
const PUBLIC_PREFIXES = ["uploads/", "screenshots/"];

/** Photo uploads go straight into R2. */
export const uploads = new Hono<AppEnv>();

uploads.post("/", async (c) => {
  const user = requireUser(c);
  await enforceLimit(c.env.WRITE_LIMITER, `upload:${user.id}`);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail(400, "Attach an image");
  if (!IMAGE_TYPES[file.type]) fail(415, "Use a JPEG, PNG, WebP, GIF or AVIF image");
  if (file.size > MAX_UPLOAD_BYTES) fail(413, "Images must be under 8 MB");

  const used = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM uploads WHERE owner_id = ? AND created_at > unixepoch() - 86400",
  )
    .bind(user.id)
    .first<{ n: number; bytes: number }>();
  if ((used?.n ?? 0) >= DAILY_UPLOADS || (used?.bytes ?? 0) + file.size > DAILY_UPLOAD_BYTES) {
    fail(429, "That's today's photo limit; try again tomorrow");
  }

  // The declared type is only the browser's guess, so the Images binding reads the bytes (info() is free).
  let format: string;
  try {
    ({ format } = await c.env.IMAGES.info(file.stream()));
  } catch {
    fail(415, "That file isn't an image");
  }
  const extension = IMAGE_TYPES[format];
  if (!extension) fail(415, "Use a JPEG, PNG, WebP, GIF or AVIF image");

  const key = `uploads/${user.id}/${crypto.randomUUID()}.${extension}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: format } });
  await c.env.DB.prepare("INSERT INTO uploads (key, owner_id, content_type, size) VALUES (?, ?, ?, ?)")
    .bind(key, user.id, format, file.size)
    .run();
  track(c.env, "upload", { userId: user.id, country: country(c), value: file.size });
  return c.json({ key, url: `/img/${key}` }, 201);
});

/**
 * Serves R2 images, resized by the Images binding to one of three fixed widths.
 * Each (image, width) pair counts once toward the 5,000 free transformations a month,
 * and the result is kept in the edge cache.
 */
export const images = new Hono<AppEnv>();

images.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) return c.notFound();

  const requested = Number(c.req.query("w"));
  const width = IMAGE_WIDTHS.find((allowed) => allowed === requested);
  const accept = c.req.header("accept") ?? "";
  const format = accept.includes("image/avif") ? "image/avif" : accept.includes("image/webp") ? "image/webp" : "image/jpeg";

  const cacheKey = new Request(new URL(`/img/${key}?w=${width ?? 0}&f=${width ? format : "original"}`, c.req.url));
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // A photo from a rejected post is no longer served once its cached copies expire,
  // except to the site owner (who reviews rejected posts on the Admin page) and its author.
  let rejected = false;
  if (key.startsWith("uploads/")) {
    const post = await c.env.DB.prepare("SELECT author_id FROM posts WHERE image_key = ? AND status = 'rejected' LIMIT 1")
      .bind(key)
      .first<{ author_id: string }>();
    if (post) {
      await loadSession(c, async () => {});
      const user = c.get("user");
      if (!user?.isAdmin && user?.id !== post.author_id) return c.notFound();
      rejected = true;
    }
  }

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();
  const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";

  let response: Response | null = null;
  if (width && contentType !== "image/gif") {
    try {
      const result = await c.env.IMAGES.input(object.body).transform({ width, fit: "scale-down" }).output({ format, quality: 80 });
      response = result.response();
    } catch (error) {
      // Over the monthly allowance (error 9422) or an unsupported input: serve the original instead.
      console.warn("image transformation failed; serving original", error);
    }
  }
  if (!response) {
    const original = width ? await c.env.MEDIA.get(key) : object;
    if (!original) return c.notFound();
    response = new Response(original.body, { headers: { "content-type": contentType } });
  }

  const headers = new Headers(response.headers);
  // Member photos are cached for an hour, so one from a post the owner rejects goes away soon; screenshots never change.
  // A rejected post's photo, shown only to the owner or author, is never stored in a shared cache.
  headers.set(
    "cache-control",
    rejected ? "private, no-store" : key.startsWith("uploads/") ? "public, max-age=3600" : "public, max-age=31536000, immutable",
  );
  headers.set("vary", "Accept");
  headers.set("x-content-type-options", "nosniff");
  const final = new Response(response.body, { status: 200, headers });
  if (!rejected) c.executionCtx.waitUntil(cache.put(cacheKey, final.clone()));
  return final;
});
