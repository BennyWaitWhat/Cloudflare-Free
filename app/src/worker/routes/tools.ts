import { Hono } from "hono";
import type { AppEnv } from "../env";
import type { LinkPreview } from "../../shared/types";
import { track } from "../lib/analytics";
import { enforceLimit, spendDaily } from "../lib/guards";
import { country, fail, rateKey, readBody, requireUser, sha256Hex } from "../lib/http";
import { fetchPreview, parsePublicUrl } from "../lib/preview";

export const tools = new Hono<AppEnv>();

/** Which Cloudflare data center answered, from the request's `cf` object. */
tools.get("/trace", (c) => {
  const cf = (c.req.raw.cf ?? {}) as Record<string, unknown>;
  const pick = (key: string) => (cf[key] === undefined ? null : cf[key]);
  return c.json({
    colo: pick("colo"),
    country: pick("country"),
    city: pick("city"),
    region: pick("region"),
    continent: pick("continent"),
    timezone: pick("timezone"),
    asn: pick("asn"),
    asOrganization: pick("asOrganization"),
    httpProtocol: pick("httpProtocol"),
    tlsVersion: pick("tlsVersion"),
    ray: c.req.header("cf-ray") ?? null,
  });
});

const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "HTTPS", "SOA"];
const HOSTNAME = /^(?=.{1,253}\.?$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

/** DNS lookups through the free 1.1.1.1 DNS-over-HTTPS JSON API. */
tools.get("/dns", async (c) => {
  const name = (c.req.query("name") ?? "").trim().toLowerCase();
  const type = (c.req.query("type") ?? "A").toUpperCase();
  if (!HOSTNAME.test(name)) fail(400, "Enter a hostname such as example.com");
  if (!DNS_TYPES.includes(type)) fail(400, `Record type must be one of ${DNS_TYPES.join(", ")}`);
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const response = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!response.ok) fail(502, "The resolver didn't answer");
  track(c.env, "dns_lookup", { detail: type, country: country(c) });
  return c.json(await response.json());
});

interface StatusSummary {
  page: { updated_at: string };
  status: { indicator: string; description: string };
  incidents: { name: string; status: string; impact: string; shortlink: string }[];
}

/** Cloudflare's public status page API. */
tools.get("/status", async (c) => {
  const response = await fetch("https://www.cloudflarestatus.com/api/v2/summary.json", {
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!response.ok) fail(502, "The status page didn't answer");
  const summary = await response.json<StatusSummary>();
  return c.json({
    indicator: summary.status.indicator,
    description: summary.status.description,
    updatedAt: summary.page.updated_at,
    incidents: summary.incidents.slice(0, 5).map((incident) => ({
      name: incident.name,
      status: incident.status,
      impact: incident.impact,
      url: incident.shortlink,
    })),
  });
});

/** The latest round of the drand randomness beacon, which anyone can verify. */
tools.get("/random", async (c) => {
  const response = await fetch("https://drand.cloudflare.com/public/latest", { cf: { cacheTtl: 3 } });
  if (!response.ok) fail(502, "The randomness beacon didn't answer");
  const beacon = await response.json<{ round: number; randomness: string; signature: string }>();
  return c.json({
    round: beacon.round,
    randomness: beacon.randomness,
    signature: beacon.signature,
    dice: (Number.parseInt(beacon.randomness.slice(0, 8), 16) % 6) + 1,
    source: "https://drand.cloudflare.com/public/latest",
  });
});

/**
 * Open Graph link previews, cached in KV for a week. KV allows 1,000 writes a day,
 * so caching stops after 500 a day and later previews are simply fetched fresh.
 */
tools.post("/preview", async (c) => {
  const body = await readBody(c);
  const target = parsePublicUrl(body.url);
  const cacheKey = `preview:${await sha256Hex(target.toString())}`;
  const cached = await c.env.KV.get<LinkPreview>(cacheKey, "json");
  if (cached) return c.json({ preview: cached, cached: true });

  await enforceLimit(c.env.WRITE_LIMITER, `preview:${rateKey(c)}`);
  const preview = await fetchPreview(target);
  if (await spendDaily(c.env, "kv_budget", "writes", 1, 500)) {
    c.executionCtx.waitUntil(
      c.env.KV.put(cacheKey, JSON.stringify(preview), { expirationTtl: 60 * 60 * 24 * 7 }).catch((error) =>
        console.warn("preview not cached", error),
      ),
    );
  }
  track(c.env, "link_preview", { country: country(c) });
  return c.json({ preview, cached: false });
});

/** Page screenshots from Browser Run (10 free browser-minutes a day), stored in R2. */
tools.post("/screenshot", async (c) => {
  const user = requireUser(c);
  const body = await readBody(c);
  const target = parsePublicUrl(body.url);
  const key = `screenshots/${await sha256Hex(target.toString())}.webp`;

  if (!(await c.env.MEDIA.head(key))) {
    await enforceLimit(c.env.AI_LIMITER, `screenshot:${user.id}`);
    const response = await c.env.BROWSER.quickAction("screenshot", {
      url: target.toString(),
      viewport: { width: 1200, height: 630 },
      gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
      screenshotOptions: { type: "webp", quality: 70 },
    });
    if (response.status === 429) {
      // Free plans get 10 browser minutes a day and one Quick Action every 10 seconds; the body says which ran out.
      const detail = await response.text();
      fail(
        429,
        /exceeded for today/i.test(detail)
          ? "Today's free browser minutes are used up; try again tomorrow"
          : "Screenshots run one at a time on the free plan; try again in 10 seconds",
      );
    }
    if (!response.ok) fail(502, "The screenshot failed");
    await c.env.MEDIA.put(key, await response.arrayBuffer(), { httpMetadata: { contentType: "image/webp" } });
    track(c.env, "screenshot", { userId: user.id, value: Number(response.headers.get("x-browser-ms-used")) || 0 });
  }
  return c.json({ url: `/img/${key}` });
});
