import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { bindings, ORIGIN, signIn } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

/** A real 1x1 PNG. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (char) => char.charCodeAt(0),
);

function upload(cookie: string, bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append("file", new File([bytes], "photo.png", { type }));
  return SELF.fetch(new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: form, headers: { cookie } }));
}

describe("photo uploads", () => {
  it("stores a real image and serves it from /img", async () => {
    const { cookie } = await signIn("jared");
    const response = await upload(cookie, PNG, "image/png");
    expect(response.status).toBe(201);
    const { url } = await response.json<{ key: string; url: string }>();

    const image = await SELF.fetch(`${ORIGIN}${url}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(image.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  });

  it("refuses text that claims to be a PNG", async () => {
    const { cookie } = await signIn("gilfoyle");
    const response = await upload(cookie, new TextEncoder().encode("This is not a picture."), "image/png");
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "That file isn't an image" });
  });

  it("stops serving a photo once its post is rejected", async () => {
    const { userId, cookie } = await signIn("erlich");
    const { key, url } = await (await upload(cookie, PNG, "image/png")).json<{ key: string; url: string }>();
    await bindings.DB.prepare("INSERT INTO posts (id, author_id, kind, body, image_key, status) VALUES (?, ?, 'community', ?, ?, 'rejected')")
      .bind(crypto.randomUUID(), userId, "Aviato", key)
      .run();

    const image = await SELF.fetch(`${ORIGIN}${url}`);
    expect(image.status).toBe(404);

    // The author and the site owner can still see it, and it never lands in a shared cache.
    const owner = await signIn("richard", "test-owner-id");
    for (const viewer of [cookie, owner.cookie]) {
      const seen = await SELF.fetch(`${ORIGIN}${url}`, { headers: { cookie: viewer } });
      expect(seen.status).toBe(200);
      expect(seen.headers.get("cache-control")).toBe("private, no-store");
      await seen.arrayBuffer();
    }
    const stranger = await signIn("big_head");
    expect((await SELF.fetch(`${ORIGIN}${url}`, { headers: { cookie: stranger.cookie } })).status).toBe(404);
  });

  it("stops a member at 20 photos a day", async () => {
    const { userId, cookie } = await signIn("jian_yang");
    const insert = bindings.DB.prepare("INSERT INTO uploads (key, owner_id, content_type, size) VALUES (?, ?, 'image/png', 100)");
    await bindings.DB.batch(Array.from({ length: 20 }, (_, n) => insert.bind(`uploads/${userId}/old-${n}.png`, userId)));

    const response = await upload(cookie, PNG, "image/png");
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "That's today's photo limit; try again tomorrow" });
  });
});
