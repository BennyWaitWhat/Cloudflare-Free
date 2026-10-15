import { Hono } from "hono";
import type { AppEnv } from "../env";
import { CATALOG, score } from "../../shared/catalog";
import type { SiteConfig } from "../../shared/types";

export const meta = new Hono<AppEnv>();

meta.get("/health", (c) =>
  c.json({
    ok: true,
    version: c.env.VERSION.id,
    tag: c.env.VERSION.tag || null,
    deployedAt: c.env.VERSION.timestamp || null,
  }),
);

meta.get("/config", (c) => {
  const config: SiteConfig = {
    siteName: c.env.SITE_NAME,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    webAnalyticsToken: c.env.WEB_ANALYTICS_TOKEN,
    user: c.get("user"),
  };
  return c.json(config);
});

meta.get("/catalog", (c) => {
  c.header("cache-control", "public, max-age=300");
  return c.json({ offerings: CATALOG, score: score(CATALOG) });
});

meta.get("/stats", async (c) => {
  const row = await c.env.DB.prepare("SELECT day, data FROM daily_stats ORDER BY day DESC LIMIT 1").first<{
    day: string;
    data: string;
  }>();
  return c.json({ day: row?.day ?? null, stats: row ? (JSON.parse(row.data) as Record<string, number>) : null });
});
