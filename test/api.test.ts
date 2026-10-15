import {
  applyD1Migrations,
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
  introspectWorkflow,
  SELF,
} from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/worker/index";
import type { JobMessage } from "../src/worker/env";
import { bindings, ORIGIN, postJson, signIn, turnstileFetch } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("site metadata", () => {
  it("reports health", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("serves a catalog whose score adds up", async () => {
    const { offerings, score } = await (await SELF.fetch(`${ORIGIN}/api/catalog`)).json<{
      offerings: { id: string }[];
      score: { total: number; built: number; remaining: number; byStatus: Record<string, number> };
    }>();
    expect(score.total).toBe(offerings.length);
    expect(score.built + score.remaining + score.byStatus.skipped).toBe(score.total);
    expect(new Set(offerings.map((offering) => offering.id)).size).toBe(offerings.length);
  });

  it("generates security.txt for the serving host", async () => {
    const text = await (await SELF.fetch(`${ORIGIN}/.well-known/security.txt`)).text();
    expect(text).toContain(`Contact: ${ORIGIN}/contact`);
    expect(text).toMatch(/Expires: \d{4}-/);
  });

  it("answers unknown API routes with JSON", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});

describe("request validation", () => {
  it("requires sign-in to post", async () => {
    const response = await SELF.fetch(postJson("/api/posts", { body: "hello" }));
    expect(response.status).toBe(401);
  });

  it("rejects usernames outside a-z, 0-9 and _", async () => {
    const response = await SELF.fetch(postJson("/api/auth/register/options", { username: "Not Valid!" }));
    expect(response.status).toBe(400);
  });

  it("refuses link previews for private hosts", async () => {
    for (const url of ["http://10.0.0.1/", "http://[::1]/", "http://printer.local/", "ftp://example.com/"]) {
      const response = await SELF.fetch(postJson("/api/tools/preview", { url }));
      expect(response.status, url).toBe(400);
    }
  });

  it("only serves public image prefixes", async () => {
    const response = await SELF.fetch(`${ORIGIN}/img/private/secret.png`);
    expect(response.status).toBe(404);
  });
});

describe("passkey sign-in", () => {
  it("issues a challenge for the serving host", async () => {
    const response = await SELF.fetch(new Request(`${ORIGIN}/api/auth/login/options`, { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rpId: "site.test" });
    expect(response.headers.get("set-cookie")).toContain("passkey_challenge=");
  });

  it("recognises a session cookie", async () => {
    const { cookie } = await signIn("session_check");
    const response = await SELF.fetch(`${ORIGIN}/api/auth/me`, { headers: { cookie } });
    expect(await response.json()).toMatchObject({ user: { username: "session_check", isAdmin: false } });
  });

  it("grants admin to listed usernames", async () => {
    const { cookie } = await signIn("owner");
    const response = await SELF.fetch(`${ORIGIN}/api/admin/overview`, { headers: { cookie } });
    expect(response.status).toBe(200);
  });

  it("keeps members out of admin", async () => {
    const { cookie } = await signIn("member_one");
    const response = await SELF.fetch(`${ORIGIN}/api/admin/overview`, { headers: { cookie } });
    expect(response.status).toBe(403);
  });
});

describe("contact form", () => {
  it("rejects a failed human check", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(turnstileFetch(false));
    const response = await SELF.fetch(
      postJson("/api/contact", { name: "Ada", email: "ada@example.com", message: "Hello there", turnstileToken: "token" }),
    );
    expect(response.status).toBe(403);
  });

  it("delivers a verified message through the Queue into D1", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(turnstileFetch(true));
    const response = await SELF.fetch(
      postJson("/api/contact", { name: "Ada", email: "ada@example.com", message: "Hello there", turnstileToken: "token" }),
    );
    expect(response.status).toBe(202);

    // The consumer runs once the batch window (max_batch_timeout = 5 s) closes.
    await vi.waitFor(
      async () => {
        const row = await bindings.DB.prepare("SELECT message FROM contact_messages WHERE email = ?").bind("ada@example.com").first();
        expect(row).toEqual({ message: "Hello there" });
      },
      { timeout: 15_000, interval: 250 },
    );
  }, 20_000);

  it("stores queued messages once, even when retried", async () => {
    const body: JobMessage = {
      type: "contact",
      id: "contact-1",
      name: "Grace",
      email: "grace@example.com",
      message: "Queued hello",
      country: "US",
      at: 1_760_000_000,
    };
    const batch = createMessageBatch<JobMessage>("cloudflare-free-jobs", [
      { id: "message-1", timestamp: new Date(), attempts: 1, body },
      { id: "message-2", timestamp: new Date(), attempts: 2, body },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, bindings);
    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(["message-1", "message-2"]);
    const { results } = await bindings.DB.prepare("SELECT name FROM contact_messages WHERE id = ?").bind("contact-1").all();
    expect(results).toEqual([{ name: "Grace" }]);
  });
});

describe("posting", () => {
  it("puts a member's post in review, then the Workflow publishes it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(turnstileFetch(true));
    const workflows = await introspectWorkflow(bindings.MODERATE_POST);
    try {
      await workflows.modifyAll(async (modifier) => {
        await modifier.mockStepResult({ name: "check safety" }, { safe: true, categories: [] });
        await modifier.mockStepResult({ name: "index for search" }, true);
      });
      const { cookie } = await signIn("poster");
      const response = await SELF.fetch(postJson("/api/posts", { body: "My first post", turnstileToken: "token" }, { cookie }));
      expect(response.status).toBe(202);
      const { post } = await response.json<{ post: { id: string; status: string } }>();
      expect(post.status).toBe("pending");

      const [instance] = await workflows.get();
      await instance.waitForStatus("complete");
      await instance.dispose();
      const feed = await (await SELF.fetch(`${ORIGIN}/api/posts?kind=community`)).json<{ posts: { id: string }[] }>();
      expect(feed.posts.map((item) => item.id)).toContain(post.id);
    } finally {
      await workflows.dispose();
    }
  });

  it("keeps blog posts for the owner", async () => {
    const { cookie } = await signIn("not_owner");
    const response = await SELF.fetch(postJson("/api/posts", { kind: "blog", body: "Blog", turnstileToken: "t" }, { cookie }));
    expect(response.status).toBe(403);
  });
});
