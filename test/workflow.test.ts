import { applyD1Migrations, introspectWorkflowInstance } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { bindings, signIn } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

async function pendingPost(body: string): Promise<string> {
  const { userId } = await signIn(`author_${crypto.randomUUID().slice(0, 8)}`);
  const id = crypto.randomUUID();
  await bindings.DB.prepare("INSERT INTO posts (id, author_id, kind, body) VALUES (?, ?, 'community', ?)").bind(id, userId, body).run();
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
    const id = await pendingPost("A photo of my garden");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: true, categories: [] });
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
  });

  it("rejects a post the safety model flags", async () => {
    const id = await pendingPost("something unsafe");
    const instance = await introspectWorkflowInstance(bindings.MODERATE_POST, id);
    try {
      await instance.modify(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: false, categories: ["S10"] });
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
});
