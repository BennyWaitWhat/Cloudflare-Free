# Cloudflare Free

A website and installable web app built only from Cloudflare's free tier, with the goal of using every free thing Cloudflare offers.

It combines three sites in one:

- **Showcase:** a live [scoreboard](src/shared/catalog.ts) of every free Cloudflare offering, its free allowance, and whether this project uses it yet, plus a Lab of interactive demos.
- **Community:** passkey accounts, photo posts that an AI Workflow moderates before publishing, and real-time chat rooms.
- **Personal site:** a blog with semantic search, a contact form, and an admin inbox.

The research behind it is in [docs/research/free-tier-report.md](docs/research/free-tier-report.md), with per-area notes in [docs/research/notes](docs/research/notes). It reflects Cloudflare's free tier as of 2026-10-14.

> Unofficial project; not affiliated with Cloudflare.

## Where it stands

The catalog tracks 82 free offerings. 58 already have working code here: 31 work as soon as the Worker deploys, 5 need a one-time setup step, 2 need a card on file, and 20 switch on once your domain is on Cloudflare. 21 are planned and 3 are skipped (each has a reason in the catalog). The scoreboard page shows the current list.

## How the free products fit together

| Feature | Cloudflare products |
|---|---|
| Web app (installable PWA) | Workers Static Assets (unlimited free asset requests), service worker, web manifest |
| API | Workers + Hono, Smart Placement, Rate Limiting binding, version metadata |
| Accounts | Passkeys (WebAuthn) verified in the Worker, HMAC-signed session cookies, Turnstile on sign-up |
| Posts and photos | D1 (posts, members), R2 (photos), Images binding (three fixed widths), Cache API |
| Moderation pipeline | Workflows: Llama Guard safety check, vision-model alt text, bge embeddings into Vectorize, publish |
| Chat | One SQLite Durable Object per room, WebSocket Hibernation, auto-response heartbeats |
| AI assistant and Lab | Workers AI (GLM-4.7 Flash, FLUX.1 schnell, Markdown conversion), optional AI Gateway, Browser Run screenshots |
| Link previews | Worker fetch + HTMLRewriter, cached in KV for a week |
| Contact form | Turnstile, Queues (with a dead-letter queue), D1, send-email binding to your own address |
| Inbound email | Email Routing to an Email Worker, parsed into the admin inbox |
| Insights | Workers Analytics Engine events, Workers Logs, Traces and Issues, nightly Cron Trigger rollup into D1 |
| Public tools | 1.1.1.1 DNS over HTTPS, Cloudflare Status API, drand randomness beacon, `request.cf` edge data |

### Staying inside the free allowances

The free tier is a set of daily and monthly budgets, so the code is written to spend as little of them as possible:

- **Worker requests (100,000/day):** pages, scripts and images are static assets and never invoke the Worker. Only `/api/*`, `/img/*` and `security.txt` do.
- **CPU (10 ms per request):** passkeys instead of password hashing, which wouldn't fit.
- **KV writes (1,000/day):** sessions are signed cookies rather than KV entries. KV only caches link previews, and only after a rate-limit check.
- **Image transformations (5,000/month):** only 320, 640 and 1280 px widths, so each photo uses at most three. The vision step reuses the 640 px size, and results are edge-cached.
- **Neurons (10,000/day):** small models, thinking disabled, short outputs, and per-IP AI rate limits. Hitting the cap returns a clear "resets at midnight UTC" message.
- **Browser minutes (10/day):** screenshots are for signed-in members only, rate limited, and stored in R2 so each URL is captured once.
- **Durable Objects:** hibernating WebSockets, and heartbeats answered without waking the object.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
```

```bash
npm run setup
```

This creates `.dev.vars` (git-ignored) with a random session secret and Cloudflare's always-pass Turnstile test secret, then creates the local database tables.

```bash
npm run dev
```

`npm run dev` runs everything in the local Workers runtime with no Cloudflare account, including D1, KV, R2, Queues, Durable Objects and Workflows. Workers AI, Vectorize and Browser Run only exist on Cloudflare's network; after `npx wrangler login`, use `npm run dev:remote` to reach them.

Checks:

```bash
npm run typecheck
```

```bash
npm test
```

The 38 tests run inside workerd and cover the API, sessions, the Queue consumer and the moderation Workflow, with the AI steps mocked.

## First deploy (free workers.dev address)

1. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

2. In the dashboard, open **R2** and enable it. Cloudflare may ask for a payment method; the free allowance is 10 GB-month.
3. Create the search index once. It needs 384 dimensions to match `bge-small-en-v1.5`:

   ```bash
   npx wrangler vectorize create cloudflare-free-search --dimensions=384 --metric=cosine
   ```

4. Create a **Turnstile** widget in the dashboard (free). Put its site key in `TURNSTILE_SITE_KEY` in `wrangler.jsonc`, replacing the test key. Then set `ADMIN_USERNAMES` to the username you'll sign up with.
5. Deploy. Wrangler creates the D1 database, KV namespace, R2 bucket and queues on first deploy:

   ```bash
   npm run deploy
   ```

6. Add the secrets and apply the database schema:

   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

   ```bash
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

   ```bash
   npm run db:migrate:remote
   ```

Optional, still without a domain:

- **AI Gateway:** create a gateway and put its id in `AI_GATEWAY_ID` for caching, rate limits and logs on AI calls.
- **Web Analytics:** add a site and put its token in `WEB_ANALYTICS_TOKEN`.
- **Workers Builds:** connect this GitHub repo to the Worker in the dashboard, with build command `npm run build` and deploy command `npx wrangler deploy`, for push-to-deploy with preview URLs.
- **Notifications:** add email or webhook alerts for Worker errors and DDoS events.

Passkeys belong to the hostname that created them, so accounts made on workers.dev won't carry over to your domain. Create your real account after the domain step.

## When the domain is on Cloudflare

These switch on about half the catalog; each is free on the Free plan.

1. Add the domain to Cloudflare, switch the nameservers, then turn on DNSSEC.
2. Serve the Worker on it: add `"routes": [{ "pattern": "example.com", "custom_domain": true }]` to `wrangler.jsonc` and deploy.
3. **Email:**
   - Enable Email Routing and verify your own address as a destination.
   - Route an address such as `hello@` to the `cloudflare-free` Worker.
   - Add a `send_email` binding named `NOTIFY_EMAIL`, plus the `OWNER_EMAIL` and `NOTIFY_FROM` vars.
   - Turn on DMARC Management.
4. **Security:**
   - The Free Managed Ruleset and DDoS protection are already on.
   - Add WAF custom rules (5 free) and the one rate-limiting rule, for example on `/api/auth/*`.
   - Turn on AI bot policies, AI Labyrinth and managed robots.txt.
   - Turn on HSTS, minimum TLS 1.2, Certificate Transparency Monitoring, Security Insights, Client-side security, and API Shield schema validation.
5. **Speed and rules:**
   - Turn on HTTP/3, Early Hints and Speed Brain.
   - Add a cache rule for `/assets/*`.
   - Add the security headers managed transform.
   - Add a www-to-apex redirect.
6. **Zaraz and Observatory:** consent-managed tags and real-user monitoring.
7. **Access (needs a card on file):** protect `/admin` with a Zero Trust Access application for your own email.

## Project layout

```text
src/worker/          Worker: Hono API, Durable Object, Workflow, queue, cron and email handlers
src/client/          React web app (pages, components, passkey sign-in)
src/shared/          Catalog of free offerings and types shared by both sides
migrations/          D1 schema
public/              Manifest, service worker, icons, robots.txt with Content Signals
test/                Vitest suites that run inside workerd
docs/research/       The free-tier research report and notes
scripts/             Local setup and icon generator
```

`src/worker`, `src/client`, `test` and `scripts` each have their own `tsconfig.json`, so the repo root stays short.
