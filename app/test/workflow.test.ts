import { applyD1Migrations, introspectWorkflowInstance, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { bindings, postJson, signIn } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

/** Every test in this file shares one database, so each post needs an author of its own. */
async function pendingPost(author: string, body: string, imageKey: string | null = null): Promise<string> {
  const { userId } = await signIn(author);
  const id = crypto.randomUUID();
  await bindings.DB.prepare("INSERT INTO posts (id, author_id, kind, body, image_key) VALUES (?, ?, 'community', ?, ?)")
    .bind(id, userId, body, imageKey)
    .run();
  return id;
}

async function postRow(id: string) {
  return bindings.DB.prepare("SELECT status, moderation_note, published_at FROM posts WHERE id = ?")
    .bind(id)
    .first<{ status: string; moderation_note: string | null; published_at: number | null }>();
}

// The AI steps are mocked: Workers AI and Vectorize only run on Cloudflare's network.
describe("moderation workflow", () => {
  it("publishes a post the safety model accepts", async () => {
    const id = await pendingPost("bighead", "A photo of my garden");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: true, categories: [], skipped: false });
        await modifier.mockStepResult({ name: "index for search" }, true);
      });
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "published", indexed: true });
    } finally {
      await instance.dispose();
    }
    const row = await postRow(id);
    expect(row?.status).toBe("published");
    expect(row?.published_at).toBeGreaterThan(0);
    expect(row?.moderation_note).toBeNull();
  });

  it("rejects a post the safety model flags", async () => {
    const id = await pendingPost("gavin", "something unsafe");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: false, categories: ["S10"], skipped: false });
      });
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "rejected" });
    } finally {
      await instance.dispose();
    }
    const row = await postRow(id);
    expect(row?.status).toBe("rejected");
    expect(row?.moderation_note).toContain("S10");
  });

  // Nothing is mocked here, so Miniflare logs "Binding AI needs to be run remotely" twice; the Workflow catches both.
  it("publishes without AI checks, and says so, when Workers AI isn't reachable (local dev)", async () => {
    const id = await pendingPost("dinesh", "Posted from my laptop");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "published", indexed: false });
    } finally {
      await instance.dispose();
    }
    const row = await postRow(id);
    expect(row?.status).toBe("published");
    expect(row?.moderation_note).toBe("Published without AI checks (local dev)");
  });

  it("rejects a post whose photo the vision model describes as unsafe", async () => {
    const id = await pendingPost("erlich", "Look what happened at Aviato", "uploads/erlich/photo.jpg");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "describe photo" }, "a graphic photo of an injury");
        await modifier.mockStepResult({ name: "check safety" }, { safe: false, categories: ["S1"], skipped: false });
      });
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "rejected" });
    } finally {
      await instance.dispose();
    }
    expect((await postRow(id))?.status).toBe("rejected");
  });

  it("holds a post for the owner when its photo couldn't be described", async () => {
    const id = await pendingPost("jared", "Our team offsite", "uploads/jared/photo.jpg");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "describe photo" }, null);
        await modifier.mockStepResult({ name: "check safety" }, { safe: true, categories: [], skipped: false });
      });
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "pending" });
    } finally {
      await instance.dispose();
    }
    const row = await postRow(id);
    expect(row?.status).toBe("pending");
    expect(row?.moderation_note).toBe("The photo could not be checked; the site owner can publish it from the Admin page");
  });

  it("keeps the owner's rejection when the Workflow finishes afterwards", async () => {
    const id = await pendingPost("monica", "Raviga is in");
    const { cookie } = await signIn("richard", "test-owner-id");
    const reject = await SELF.fetch(postJson(`/api/admin/posts/${id}/status`, { status: "rejected" }, { cookie }));
    expect(reject.status).toBe(200);

    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: true, categories: [], skipped: false });
        await modifier.mockStepResult({ name: "index for search" }, true);
      });
      await bindings.MODERATE_POST.create({ id, params: { postId: id } });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "decided by the owner", indexed: true });
    } finally {
      await instance.dispose();
    }
    const row = await postRow(id);
    expect(row?.status).toBe("rejected");
    expect(row?.moderation_note).toBe("Rejected by the site owner");
  });
});
