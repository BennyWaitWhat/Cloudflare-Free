import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { CATALOG, score } from "../src/shared/catalog";
import type { AppEnv, Bindings } from "../src/worker/env";
import { moderate, textFromEvent } from "../src/worker/lib/ai";
import { fromBase64Url, toBase64Url } from "../src/worker/lib/encoding";
import { rateKey } from "../src/worker/lib/http";
import { isPrivateAddress } from "../src/worker/lib/preview";
import { indexForSearch } from "../src/worker/lib/posts";

describe("Workers AI stream parsing", () => {
  it("reads classic and OpenAI-style events", () => {
    expect(textFromEvent('data: {"response":"Hello"}')).toBe("Hello");
    expect(textFromEvent('data: {"choices":[{"delta":{"content":" world"}}]}')).toBe(" world");
  });

  it("ignores markers, comments and junk", () => {
    expect(textFromEvent("data: [DONE]")).toBe("");
    expect(textFromEvent(": keep-alive")).toBe("");
    expect(textFromEvent("data: {not json")).toBe("");
  });
});

describe("safety model input", () => {
  /** Stands in for Workers AI and records what the safety model was sent. */
  function fakeAi() {
    const sent: string[] = [];
    const env = {
      AI_GATEWAY_ID: "",
      AI: {
        run: async (_model: string, input: { messages: { content: string }[] }) => {
          sent.push(input.messages[0].content);
          return { response: { safe: true, categories: [] } };
        },
      },
    } as unknown as Bindings;
    return { env, sent };
  }

  it("sends the whole of the longest possible post", async () => {
    const { env, sent } = fakeAi();
    const post = `${"T".repeat(140)}\n\n${"b".repeat(4989)}END-OF-POST`;
    expect(post).toHaveLength(5142);
    expect(await moderate(env, post)).toEqual({ safe: true, categories: [] });
    expect(sent[0]?.endsWith("END-OF-POST")).toBe(true);
  });

  it("refuses longer text without asking the model", async () => {
    const { env, sent } = fakeAi();
    expect(await moderate(env, "a".repeat(6001))).toEqual({ safe: false, categories: ["too-long"] });
    expect(sent).toEqual([]);
  });
});

describe("rate limit keys", () => {
  async function keyFor(ip: string): Promise<string> {
    const app = new Hono<AppEnv>();
    app.get("/", (c) => c.text(rateKey(c)));
    return (await app.request("/", { headers: { "cf-connecting-ip": ip } })).text();
  }

  it("counts an IPv6 visitor by their /64", async () => {
    expect(await keyFor("2001:db8:1:2::1")).toBe("2001:0db8:0001:0002::/64");
    expect(await keyFor("2001:db8:1:2:aaaa::9")).toBe("2001:0db8:0001:0002::/64");
    expect(await keyFor("2001:db8:1:3::1")).toBe("2001:0db8:0001:0003::/64");
  });

  it("keeps an IPv4 address as it is", async () => {
    expect(await keyFor("203.0.113.5")).toBe("203.0.113.5");
  });
});

describe("private address detection", () => {
  it.each(["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.0.10", "100.64.0.1", "0.0.0.0", "[::1]", "[fd00::1]", "[fe80::1]"])(
    "blocks %s",
    (host) => expect(isPrivateAddress(host)).toBe(true),
  );

  it.each(["1.1.1.1", "8.8.8.8", "172.32.0.1", "example.com", "[2606:4700::1111]"])("allows %s", (host) =>
    expect(isPrivateAddress(host)).toBe(false),
  );
});

describe("base64url", () => {
  it("round-trips every padding length", () => {
    for (const length of [0, 1, 2, 3, 4, 31, 32, 33]) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });
});

describe("catalog", () => {
  it("counts every offering exactly once", () => {
    const totals = score(CATALOG);
    const counted = Object.values(totals.byStatus).reduce((sum, count) => sum + count, 0);
    expect(counted).toBe(CATALOG.length);
  });
});

describe("search indexing", () => {
  /** Stands in for Workers AI and Vectorize, recording what was stored. */
  function fakeSearch(upsert: (vectors: { id: string; metadata?: unknown }[]) => Promise<void>) {
    return {
      AI_GATEWAY_ID: "",
      AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
      SEARCH_INDEX: { upsert },
    } as unknown as Bindings;
  }

  it("stores the post's vector under its id and kind", async () => {
    const stored: { id: string; metadata?: unknown }[] = [];
    const env = fakeSearch(async (vectors) => {
      stored.push(...vectors);
    });
    expect(await indexForSearch(env, "post-1", "community", "Not hotdog")).toBe(true);
    expect(stored).toEqual([expect.objectContaining({ id: "post-1", metadata: { kind: "community" } })]);
  });

  it("reports false instead of failing when the index doesn't exist yet", async () => {
    const env = fakeSearch(async () => {
      throw new Error("index cloudflare-free-search not found");
    });
    expect(await indexForSearch(env, "post-2", "blog", "Middle-out")).toBe(false);
  });
});
