// Every free Cloudflare offering this project tracks, with the free allowance
// from docs/research/free-tier-report.md (checked 2026-10-14). The scoreboard
// page and the AI assistant both read this list, so keep it current.

export type Category =
  | "Compute"
  | "Data"
  | "AI"
  | "Media & email"
  | "Security"
  | "Delivery"
  | "Rules & admin"
  | "Zero Trust & network"
  | "Public tools";

export type Status =
  /** Active as soon as the Worker is deployed. */
  | "live"
  /** Built, but only switches on once your domain is on Cloudflare. */
  | "domain"
  /** Free, but Cloudflare asks for a payment method first. */
  | "card"
  /** Free; needs a one-time dashboard, CLI or secret step (see README). */
  | "setup"
  /** Free and on the roadmap, not built yet. */
  | "planned"
  /** Not usable in a Cloudflare-only build of this site; `use` says why. */
  | "skipped";

export interface Offering {
  id: string;
  name: string;
  category: Category;
  /** The free allowance. */
  free: string;
  status: Status;
  /** How this project uses it (or why it doesn't). */
  use: string;
  /** App route that shows it working. */
  where?: string;
  /** Switched on in the dashboard or always on; no code or config in this repo. */
  setting?: boolean;
}

export const CATEGORIES: Category[] = [
  "Compute",
  "Data",
  "AI",
  "Media & email",
  "Security",
  "Delivery",
  "Rules & admin",
  "Zero Trust & network",
  "Public tools",
];

export const STATUS_LABELS: Record<Status, string> = {
  live: "Live",
  domain: "Needs domain",
  card: "Needs card on file",
  setup: "One-time setup",
  planned: "Planned",
  skipped: "Skipped",
};

export const CATALOG: Offering[] = [
  // Compute
  { id: "workers", name: "Workers", category: "Compute", free: "100,000 requests/day, 10 ms CPU per request", status: "live", use: "The API behind posts, chat, AI, uploads and tools", where: "/lab" },
  { id: "static-assets", name: "Workers Static Assets", category: "Compute", free: "Unlimited asset requests; 20,000 files", status: "live", use: "Serves this installable web app without spending Worker requests", where: "/" },
  { id: "workers-dev", name: "workers.dev subdomain", category: "Compute", free: "A free URL for every Worker", status: "live", use: "The site's first home, before the custom domain" },
  { id: "versions", name: "Versions, preview URLs and rollbacks", category: "Compute", free: "Preview URL per version; rollback to the last 100 versions", status: "live", use: "Every upload gets its own preview URL" },
  { id: "workers-builds", name: "Workers Builds", category: "Compute", free: "3,000 build minutes/month", status: "setup", setting: true, use: "Push to GitHub to deploy; connect the repo once in the dashboard" },
  { id: "smart-placement", name: "Smart Placement", category: "Compute", free: "Included", status: "live", use: "Runs the API close to D1 instead of close to the visitor" },
  { id: "cron-triggers", name: "Cron Triggers", category: "Compute", free: "5 per account; each run counts as one request", status: "live", use: "Nightly stats rollup" },
  { id: "rate-limiting-binding", name: "Rate Limiting binding", category: "Compute", free: "Included; 10 s or 60 s windows", status: "live", use: "Throttles sign-ups, posts, uploads and AI calls" },
  { id: "workers-logs", name: "Workers Logs", category: "Compute", free: "200,000 events/day, 3-day retention (0.5 GB/day pooled from 2026-12-01)", status: "live", use: "Structured logs for every API request" },
  { id: "traces-issues", name: "Workers Traces and Issues", category: "Compute", free: "Free in open beta; from 2026-12-01 shares the 0.5 GB/day Observability pool", status: "live", use: "Automatic tracing and grouped errors" },
  { id: "service-bindings", name: "Service bindings and RPC", category: "Compute", free: "No extra charge", status: "planned", use: "Split media jobs into a second Worker" },
  { id: "workers-cache", name: "Workers Cache", category: "Compute", free: "No storage fee", status: "planned", use: "Cache API responses in a separate API Worker (it would bill asset requests here)" },
  { id: "flagship", name: "Flagship feature flags", category: "Compute", free: "Public beta", status: "planned", use: "Gradual rollouts for new features" },
  { id: "pages", name: "Pages", category: "Compute", free: "500 builds/month (legacy; Workers recommended)", status: "planned", use: "Publish the research docs as a separate Pages site" },
  { id: "tooling", name: "Wrangler, Vite plugin, Miniflare, Vitest pool", category: "Compute", free: "Free and open source", status: "live", use: "Local development, tests and deploys" },

  // Data
  { id: "d1", name: "D1", category: "Data", free: "5M rows read and 100,000 rows written/day; 5 GB", status: "live", use: "Members, passkeys, posts, contact messages and the inbox", where: "/community" },
  { id: "kv", name: "Workers KV", category: "Data", free: "100,000 reads and 1,000 writes/day; 1 GB", status: "live", use: "Link-preview cache", where: "/lab" },
  { id: "r2", name: "R2", category: "Data", free: "10 GB-month, 1M Class A and 10M Class B operations/month, free egress", status: "card", use: "Photo uploads and page screenshots", where: "/community" },
  { id: "durable-objects", name: "Durable Objects (SQLite)", category: "Data", free: "100,000 requests and 13,000 GB-s/day; 5 GB", status: "live", use: "One chat room per object, with hibernating WebSockets", where: "/community" },
  { id: "queues", name: "Queues", category: "Data", free: "10,000 operations/day", status: "live", use: "Contact-form delivery with retries and a dead-letter queue", where: "/contact" },
  { id: "workflows", name: "Workflows", category: "Data", free: "3,000 steps/day", status: "live", use: "Moderate, describe, index and publish every post", where: "/community" },
  { id: "analytics-engine", name: "Workers Analytics Engine", category: "Data", free: "100,000 data points written and 10,000 queries/day", status: "live", use: "Custom event analytics for every feature" },
  { id: "cache-api", name: "Cache API", category: "Data", free: "No separate quota", status: "live", use: "Caches resized images at the edge" },
  { id: "secrets-store", name: "Secrets Store", category: "Data", free: "1 store, 100 secrets (open beta)", status: "planned", use: "Share API tokens between Workers" },
  { id: "r2-events", name: "R2 event notifications", category: "Data", free: "Free; uses Queue operations", status: "planned", use: "React to new uploads" },
  { id: "hyperdrive", name: "Hyperdrive", category: "Data", free: "100,000 queries/day", status: "skipped", use: "Needs a Postgres or MySQL database outside Cloudflare" },

  // AI
  { id: "workers-ai", name: "Workers AI", category: "AI", free: "10,000 Neurons/day", status: "live", use: "Assistant, moderation, embeddings, image generation and alt text", where: "/lab" },
  { id: "ai-gateway", name: "AI Gateway", category: "AI", free: "Core features free; 10 gateways", status: "setup", use: "Caching, rate limits and logs in front of Workers AI (set AI_GATEWAY_ID)" },
  { id: "vectorize", name: "Vectorize", category: "AI", free: "5M stored and 30M queried dimensions/month", status: "setup", use: "Semantic search over every post (create the index once)", where: "/blog" },
  { id: "browser-run", name: "Browser Run", category: "AI", free: "10 browser-minutes/day; Quick Actions 1 request every 10 s", status: "live", use: "Screenshots of links in the Lab", where: "/lab" },
  { id: "markdown", name: "Markdown conversion", category: "AI", free: "Free for documents (images spend Neurons)", status: "live", use: "Turn PDFs and Office files into Markdown", where: "/lab" },
  { id: "ai-search", name: "AI Search", category: "AI", free: "1,000 semantic and 1,000 full-text queries/month", status: "planned", use: "Managed \"ask this site\" over the blog" },
  { id: "agents-sdk", name: "Agents SDK", category: "AI", free: "Free library; runs on Durable Objects", status: "planned", use: "A stateful assistant that remembers conversations" },
  { id: "mcp", name: "Remote MCP server", category: "AI", free: "Free on Workers", status: "planned", use: "Let AI tools search this site" },

  // Media & email
  { id: "images", name: "Images transformations", category: "Media & email", free: "5,000 unique transformations/month", status: "live", use: "Resizes uploads to AVIF, WebP or JPEG at three fixed widths", where: "/community" },
  { id: "media-transformations", name: "Media Transformations", category: "Media & email", free: "Shares the 5,000/month Images allowance", status: "planned", use: "Poster frames for short video clips" },
  { id: "realtime", name: "Realtime SFU and TURN", category: "Media & email", free: "1,000 GB egress/month; STUN unlimited", status: "planned", use: "Video calls inside chat rooms" },
  { id: "email-routing", name: "Email Routing", category: "Media & email", free: "Unlimited inbound; 200 rules", status: "domain", use: "Addresses on your domain forward to your inbox" },
  { id: "email-workers", name: "Email Workers", category: "Media & email", free: "Standard Workers limits", status: "domain", use: "Inbound mail lands in the admin inbox", where: "/admin" },
  { id: "send-email", name: "Send email to verified addresses", category: "Media & email", free: "Free and unmetered (your own addresses only)", status: "domain", use: "Notifies you of new contact messages" },
  { id: "dmarc", name: "DMARC Management", category: "Media & email", free: "Free with Cloudflare DNS", status: "domain", setting: true, use: "Reports on whether the domain's mail is authentic" },

  // Security
  { id: "turnstile", name: "Turnstile", category: "Security", free: "20 widgets, unlimited challenges", status: "live", use: "Guards sign-up, posting and the contact form", where: "/contact" },
  { id: "ddos", name: "DDoS protection", category: "Security", free: "Unmetered, layers 3 to 7", status: "live", setting: true, use: "Always on in front of the Worker" },
  { id: "passkeys", name: "Passkeys on Workers", category: "Security", free: "WebCrypto is built in", status: "live", use: "Password-free sign-in that fits the 10 ms CPU budget", where: "/account" },
  { id: "waf-managed", name: "WAF Free Managed Ruleset", category: "Security", free: "Included", status: "domain", setting: true, use: "Blocks common exploits before they reach the Worker" },
  { id: "waf-custom", name: "WAF custom rules and rate limiting", category: "Security", free: "5 custom rules, 1 rate-limiting rule", status: "domain", setting: true, use: "Challenge bots on sign-up; one edge rate limit" },
  { id: "bots", name: "Bot Fight Mode and AI crawler controls", category: "Security", free: "Included; AI Labyrinth, managed robots.txt", status: "domain", setting: true, use: "Turn away scrapers; block AI training crawlers" },
  { id: "tls", name: "Universal SSL and edge TLS", category: "Security", free: "Free certificate, HSTS, TLS 1.3, ECH, post-quantum", status: "domain", setting: true, use: "HTTPS on your domain" },
  { id: "ct-monitoring", name: "Certificate Transparency Monitoring", category: "Security", free: "Included", status: "domain", setting: true, use: "Alerts when a certificate is issued for your domain" },
  { id: "client-side-security", name: "Client-side security", category: "Security", free: "Script monitoring", status: "domain", setting: true, use: "Watches which scripts the pages load" },
  { id: "api-shield", name: "API Shield", category: "Security", free: "100 endpoints, 5 schemas", status: "domain", setting: true, use: "Validates API requests against a schema" },
  { id: "security-insights", name: "Security Insights and security.txt", category: "Security", free: "Weekly scans; security.txt", status: "live", use: "security.txt is served now; scans start with the domain" },
  { id: "scrape-shield", name: "Scrape Shield", category: "Security", free: "Email obfuscation, hotlink protection", status: "domain", setting: true, use: "Hides addresses from scrapers" },
  { id: "leaked-credentials", name: "Leaked credentials detection", category: "Security", free: "Included", status: "skipped", use: "This site uses passkeys, so there are no passwords to check" },

  // Delivery
  { id: "custom-domain", name: "Workers Custom Domain", category: "Delivery", free: "Free with a zone", status: "domain", setting: true, use: "Serves the site on your own domain" },
  { id: "dns", name: "DNS and DNSSEC", category: "Delivery", free: "Free; 200 records per zone", status: "domain", setting: true, use: "Authoritative DNS for the domain" },
  { id: "cdn", name: "CDN and caching", category: "Delivery", free: "Unmetered bandwidth (no video)", status: "domain", setting: true, use: "Caches pages and images at the edge" },
  { id: "speed", name: "Speed features", category: "Delivery", free: "HTTP/3, Early Hints, Speed Brain, Zstandard, Cloudflare Fonts", status: "domain", setting: true, use: "Faster page loads" },
  { id: "web-analytics", name: "Web Analytics", category: "Delivery", free: "Free, cookieless; 10 non-proxied sites", status: "setup", use: "Visitor analytics once WEB_ANALYTICS_TOKEN is set" },
  { id: "zaraz", name: "Zaraz", category: "Delivery", free: "1,000,000 events/month", status: "domain", setting: true, use: "Consent banner and server-side tags" },
  { id: "observatory", name: "Observatory", category: "Delivery", free: "Speed tests and real-user monitoring (beta)", status: "domain", setting: true, use: "Track Core Web Vitals" },
  { id: "network", name: "WebSockets and IP geolocation", category: "Delivery", free: "Included", status: "live", use: "Live chat and the \"your edge\" card", where: "/lab" },

  // Rules & admin
  { id: "rules", name: "Rules", category: "Rules & admin", free: "10 each: cache, config, origin, transform, redirect, compression", status: "domain", setting: true, use: "The www-to-apex redirect (security headers and asset caching come from public/_headers)" },
  { id: "bulk-redirects", name: "Bulk Redirects", category: "Rules & admin", free: "15 rules, 10,000 URLs", status: "domain", setting: true, use: "Keep old links working" },
  { id: "saas", name: "Cloudflare for SaaS", category: "Rules & admin", free: "100 custom hostnames", status: "planned", use: "Members point their own domains at a profile page (needs a card)" },
  { id: "logpush", name: "Logpush", category: "Rules & admin", free: "25 GB/month to R2", status: "planned", use: "Archive request logs in R2" },
  { id: "notifications", name: "Notifications", category: "Rules & admin", free: "Email and webhooks", status: "setup", setting: true, use: "Alerts for DDoS, certificates and Worker errors" },
  { id: "graphql-analytics", name: "GraphQL Analytics API", category: "Rules & admin", free: "300 queries per 5 minutes; 31 days", status: "planned", use: "Traffic charts on the scoreboard" },
  { id: "audit-logs", name: "Audit Logs, SSO and 2FA", category: "Rules & admin", free: "18-month audit logs; dashboard SSO free", status: "live", setting: true, use: "Account security and change history" },
  { id: "terraform", name: "Terraform provider and API", category: "Rules & admin", free: "1,200 API requests per 5 minutes", status: "planned", use: "Manage zone settings as code" },
  { id: "extra-accounts", name: "Extra Free accounts", category: "Rules & admin", free: "Up to 5 Free accounts per user", status: "planned", use: "A separate staging account" },

  // Zero Trust & network
  { id: "access", name: "Access (Zero Trust)", category: "Zero Trust & network", free: "50 users", status: "card", setting: true, use: "A login wall in front of /admin" },
  { id: "tunnel", name: "Cloudflare Tunnel", category: "Zero Trust & network", free: "Free; quick tunnels need no account", status: "planned", use: "Share a local dev server" },
  { id: "gateway", name: "Gateway DNS filtering", category: "Zero Trust & network", free: "Part of the 50-user plan", status: "planned", use: "Filter DNS for your own devices" },
  { id: "resolver", name: "1.1.1.1 resolver (DNS over HTTPS)", category: "Zero Trust & network", free: "Free, no account", status: "live", use: "The DNS lookup tool", where: "/lab" },

  // Public tools
  { id: "trace", name: "Edge location (request.cf)", category: "Public tools", free: "Included", status: "live", use: "Shows which data center served you", where: "/lab" },
  { id: "status-api", name: "Cloudflare Status API", category: "Public tools", free: "Free, no account", status: "live", use: "Live platform status card", where: "/lab" },
  { id: "drand", name: "drand randomness beacon", category: "Public tools", free: "Free, no account", status: "live", use: "Verifiable random numbers", where: "/lab" },
  { id: "radar", name: "Radar API", category: "Public tools", free: "Free with a token (non-commercial data licence)", status: "planned", use: "Internet trends card" },
  { id: "url-scanner", name: "URL Scanner", category: "Public tools", free: "Free with a token", status: "planned", use: "Scan links people post" },
  { id: "speed-test", name: "Speed test", category: "Public tools", free: "Free open-source library", status: "planned", use: "Measure your connection" },
  { id: "time-services", name: "Time services (NTP/NTS)", category: "Public tools", free: "Free", status: "skipped", use: "UDP time protocols can't be called from a browser or a Worker" },
];

export interface Score {
  total: number;
  byStatus: Record<Status, number>;
  /** Offerings used here or ready to switch on (everything except planned and skipped). */
  built: number;
  /** Built offerings that run on code or config in this repo. */
  withCode: number;
  /** Built offerings that are only a dashboard setting or always on. */
  settings: number;
  /** Offerings that are free for this site but not built yet. */
  remaining: number;
}

export function score(offerings: Offering[] = CATALOG): Score {
  const byStatus: Record<Status, number> = { live: 0, domain: 0, card: 0, setup: 0, planned: 0, skipped: 0 };
  let settings = 0;
  for (const offering of offerings) {
    byStatus[offering.status] += 1;
    if (offering.setting && offering.status !== "planned" && offering.status !== "skipped") settings += 1;
  }
  const built = byStatus.live + byStatus.domain + byStatus.card + byStatus.setup;
  return { total: offerings.length, byStatus, built, withCode: built - settings, settings, remaining: byStatus.planned };
}
