import { Hono } from "hono";
import type { AppEnv } from "../env";
import { IMAGE_WIDTHS } from "../../shared/types";
import { track } from "../lib/analytics";
import { enforceLimit } from "../lib/guards";
import { country, fail, requireUser } from "../lib/http";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PUBLIC_PREFIXES = ["uploads/", "screenshots/"];

/** Photo uploads go straight into R2. */
export const uploads = new Hono<AppEnv>();

uploads.post("/", async (c) => {
  const user = requireUser(c);
  await enforceLimit(c.env.WRITE_LIMITER, `upload:${user.id}`);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail(400, "Attach an image");
  const extension = IMAGE_TYPES[file.type];
  if (!extension) fail(415, "Use a JPEG, PNG, WebP, GIF or AVIF image");
  if (file.size > MAX_UPLOAD_BYTES) fail(413, "Images must be under 8 MB");

  const key = `uploads/${user.id}/${crypto.randomUUID()}.${extension}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare("INSERT INTO uploads (key, owner_id, content_type, size) VALUES (?, ?, ?, ?)")
    .bind(key, user.id, file.type, file.size)
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
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("vary", "Accept");
  const final = new Response(response.body, { status: 200, headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, final.clone()));
  return final;
});
