import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { bindings, ORIGIN, postJson, signIn } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

/** Inserts a post that the Workflow left pending, for example one whose photo couldn't be described. */
async function heldPost(authorId: string): Promise<string> {
  const id = crypto.randomUUID();
  await bindings.DB.prepare("INSERT INTO posts (id, author_id, kind, title, body, moderation_note) VALUES (?, ?, 'community', ?, ?, ?)")
    .bind(id, authorId, "Hot dog or not", "SeeFood is back.", "The photo could not be checked; the site owner can publish it from the Admin page")
    .run();
  return id;
}

describe("owner review", () => {
  it("publishes a held post from the Admin page, and answers 404 for an unknown one", async () => {
    const owner = await signIn("richard", "test-owner-id");
    const member = await signIn("jianyang");
    const id = await heldPost(member.userId);

    const publish = await SELF.fetch(postJson(`/api/admin/posts/${id}/status`, { status: "published" }, { cookie: owner.cookie }));
    expect(publish.status).toBe(200);
    const row = await bindings.DB.prepare("SELECT status, published_at, moderation_note FROM posts WHERE id = ?")
      .bind(id)
      .first<{ status: string; published_at: number | null; moderation_note: string | null }>();
    expect(row).toMatchObject({ status: "published", moderation_note: null });
    expect(row?.published_at).toBeGreaterThan(0);
    const feed = await (await SELF.fetch(`${ORIGIN}/api/posts?kind=community`)).json<{ posts: { id: string }[] }>();
    expect(feed.posts.map((post) => post.id)).toContain(id);

    const missing = await SELF.fetch(postJson("/api/admin/posts/no-such-post/status", { status: "published" }, { cookie: owner.cookie }));
    expect(missing.status).toBe(404);
  });
});
