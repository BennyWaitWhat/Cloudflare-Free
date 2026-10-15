import { describe, expect, it } from "vitest";
import { CATALOG, score } from "../src/shared/catalog";
import { textFromEvent } from "../src/worker/lib/ai";
import { fromBase64Url, toBase64Url } from "../src/worker/lib/encoding";
import { isPrivateAddress } from "../src/worker/lib/preview";

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
