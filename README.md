<div align="center">

<img src="app/public/favicon.svg" width="80" height="80" alt="Cloudflare-Free Logo">

# Cloudflare-Free

### Enterprise Serverless Architecture on 100% Free-Tier Cloudflare Primitives

[![Edge Runtime](https://img.shields.io/badge/Edge%20Runtime-Cloudflare%20Workers%20%28workerd%29-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](#system-architecture)
[![Test Suite](https://img.shields.io/badge/Tests-62%20Passing%20%28100%25%29-2ea043?style=for-the-badge&logo=vitest&logoColor=white)](#verification--workerd-test-suite)
[![Monthly Cost](https://img.shields.io/badge/Hosting%20Cost-%240.00%20%2F%20mo-0969da?style=for-the-badge)](#primitive-matrix--budget-defense)
[![Architecture](https://img.shields.io/badge/Architecture-Hono%20%2B%20D1%20%2B%20R2%20%2B%20Vectorize-8957e5?style=for-the-badge)](#system-architecture)

<br>

<img src="assets/hero.png" width="100%" alt="Cloudflare-Free Hero Banner">

<p align="center">
  <b>A zero-cost, production-grade web application and installable PWA exhaustively exploiting 82 free Cloudflare offerings.</b><br>
  Zero servers · Zero cold starts · Zero egress bandwidth fees · Sub-10ms global edge execution.
</p>

<p align="center">
  <a href="#system-architecture">System Architecture</a> &nbsp;·&nbsp;
  <a href="#primitive-matrix--budget-defense">Primitive Matrix &amp; Budget Defense</a> &nbsp;·&nbsp;
  <a href="#workflows--ai-moderation-pipeline">Workflows &amp; AI Pipeline</a> &nbsp;·&nbsp;
  <a href="#stateful-sqlite-durable-objects">Durable Objects &amp; Chat</a> &nbsp;·&nbsp;
  <a href="#visual-showcase">Visual Showcase</a> &nbsp;·&nbsp;
  <a href="#verification--workerd-test-suite">Workerd Test Suite</a> &nbsp;·&nbsp;
  <a href="#local-quickstart">Local Quickstart</a>
</p>

</div>

---

## Executive Engineering Overview

Modern cloud architectures routinely saddle engineering teams with hundreds of dollars in monthly baseline infrastructure fees for managed PostgreSQL instances, Redis caches, object storage egress fees, and third-party identity providers.

**Cloudflare-Free** is a full-stack, enterprise-grade proof of concept demonstrating how to run a high-traffic, stateful, AI-augmented community platform with **$0.00 in hosting expenses** by mathematically aligning application architecture with Cloudflare's free-tier resource boundaries.

Built with **Hono**, **React 19**, **WebAuthn (Passkeys)**, **D1 SQLite**, **KV**, **R2**, **Durable Objects**, **Queues**, **Workflows**, **Workers AI**, and **Vectorize**, the entire system runs locally inside Cloudflare's native `workerd` runtime and deploys to Cloudflare's global anycast edge.

```
                  ┌──────────────────────────────────────────────┐
                  │          Global Visitor Ingress              │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │  Cloudflare CDN & Static Assets (Unlimited)   │
                 └───────┬───────────────────────────────┬───────┘
                         │ (HTML, JS, CSS, Media Caches) │ (/api/*, WebSocket)
                         ▼                               ▼
                 ┌───────────────┐               ┌───────────────┐
                 │  Client PWA   │               │ Hono Worker   │
                 │  (WebAuthn,   │◄─────────────►│ (Sub-10ms CPU │
                 │   Turnstile)  │  HMAC Session │  Guards, RBAC)│
                 └───────────────┘               └───────┬───────┘
                                                         │
         ┌───────────────────┬───────────────────┬───────┴───────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼                   ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  D1 (SQLite) │    │  Durable Obj │    │  R2 Storage  │    │  Cloudflare  │    │  Workers AI  │
  │  5M reads/d  │    │  WebSocket   │    │  Zero Egress │    │  Queues &    │    │  & Vectorize │
  │  Relational  │    │  Hibernation │    │  Photos & SS │    │  DLQ Alerts  │    │  384-d Search│
  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## System Architecture

The repository enforces strict separation of concerns across client execution, edge routing, persistent relational state, actor-based concurrency, and asynchronous background pipelines:

<br>

<div align="center">
  <img src="assets/architecture.svg" width="100%" alt="Cloudflare-Free High-Contrast System Architecture">
  <p><sub><b>Figure 1:</b> Cloudflare-Free end-to-end edge architecture, routing pipelines, and storage engines.</sub></p>
</div>

<br>

### 1. Ingress & Edge Routing (`app/src/worker/app.ts`)
* **Hono Framework**: Lightweight routing layer executed within Cloudflare Workers isolates. Zero cold starts, TypeScript end-to-end type safety, and ultra-low overhead per invocation.
* **Workers Static Assets**: All SPA assets (`app/public/`, React bundles, Web Manifest, service worker, icons) are served directly through Cloudflare's edge CDN. Requests for static assets **do not invoke the Worker runtime**, preserving the 100,000 requests/day free allowance strictly for dynamic `/api/*` endpoints.
* **Rate Limiting Binding & Guards**: Edge WAF policies and in-worker token buckets (`app/src/worker/lib/guards.ts`) mitigate abusive bursts on sensitive endpoints (e.g. auth ceremonies and AI generation).

### 2. Passwordless Identity & Zero-Cost Sessions (`app/src/worker/routes/auth.ts`)
* **WebAuthn / FIDO2 Passkeys**: Implemented with `@simplewebauthn/server` and `@simplewebauthn/browser`. Passkey cryptographic ceremonies replace legacy password hashing algorithms (bcrypt/argon2) that would breach Cloudflare's strict **10ms CPU execution cap**.
* **HMAC-Signed Session Cookies**: Sessions (`app/src/worker/lib/session.ts`) are cryptographically signed with HMAC-SHA256 (`env.SESSION_SECRET`). Validating user sessions requires **zero KV or D1 writes**, preserving daily storage write quotas for content operations.
* **Immutable Admin RBAC**: Administrative rights are bound directly to immutable member IDs (`env.ADMIN_USER_IDS`) rather than usernames, eliminating race conditions or administrative account takeover during sign-up.

### 3. Stateful Relational Persistence (`app/migrations/`)
* **Cloudflare D1 (SQLite)**: Core relational schema partitioned across `users`, `passkeys`, `posts`, `comments`, `contacts`, and `daily_budgets`.
* **Zero Egress Bandwidth Overhead**: SQL statements execute in the same edge data center as the Worker isolate, providing sub-millisecond query execution within the free 5,000,000 reads/day tier.

---

## Primitive Matrix & Budget Defense

To run reliably on Cloudflare's free plan, every architectural choice was engineered against a specific resource threshold:

| Cloudflare Primitive | Free Allowance | Architectural Defense & Optimization | Codebase Reference |
|---|---|---|---|
| **Workers Compute** | 100,000 req / day | Static assets handled by CDN bypass Worker invocations entirely; browser HTTP caching on `/img/*` (1 hr) avoids repeat requests. | [`app/wrangler.jsonc`](app/wrangler.jsonc) |
| **Worker CPU Time** | 10 ms / request | FIDO2 WebAuthn cryptographic verification replaces expensive CPU password hashing (bcrypt/argon2). | [`app/src/worker/routes/auth.ts`](app/src/worker/routes/auth.ts) |
| **Workers KV** | 1,000 writes / day | User sessions stored in HMAC-signed cookies instead of KV; KV is reserved exclusively for link preview caching (capped at 500 writes/day). | [`app/src/worker/lib/session.ts`](app/src/worker/lib/session.ts) |
| **D1 Database** | 5M reads · 100k writes / day | Prepared SQL queries, indexed foreign keys, and batch migrations minimize round trips. | [`app/migrations/0001_init.sql`](app/migrations/0001_init.sql) |
| **R2 Storage** | 10 GB · 1M Class A ops / mo | High-res user uploads stored in R2 with **zero egress fees**; image transformations are cached at edge. | [`app/src/worker/routes/media.ts`](app/src/worker/routes/media.ts) |
| **Cloudflare Images** | 5,000 transforms / month | Constrained to 3 fixed breakpoints (320px, 640px, 1280px); AI vision step reuses the 640px variant to prevent double-transforms. | [`app/src/worker/routes/media.ts`](app/src/worker/routes/media.ts) |
| **Durable Objects** | 100k req · 13k GB-s / day | WebSocket Hibernation API evicts idle rooms from memory; native auto-response answers `ping`/`pong` heartbeats without waking the isolate. | [`app/src/worker/durable/chat-room.ts`](app/src/worker/durable/chat-room.ts) |
| **Workers AI** | 10,000 Neurons / day | Strict token limits, thinking disabled, per-visitor throttling; generation halted at 6,000 Neurons to ensure moderation budget never starves. | [`app/src/worker/lib/ai.ts`](app/src/worker/lib/ai.ts) |
| **Browser Rendering** | 10 min / day (1 req / 10s) | Restricted to signed-in members; screenshot outputs are persisted in R2 so each target URL is captured at most once. | [`app/src/worker/routes/tools.ts`](app/src/worker/routes/tools.ts) |

---

## Workflows & AI Moderation Pipeline

Every user-submitted post undergoes an automated, multi-stage validation, safety screening, and semantic indexing pipeline managed by **Cloudflare Workflows** (`app/src/worker/workflows/moderate-post.ts`):

```
[ User Post Submission ]
          │
          ▼
┌──────────────────┐
│ step.do:         │
│ "load post"      │──► Query D1 SQLite (status: 'pending')
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ step.do:         │
│ "describe photo" │──► Workers AI: @cf/meta/llama-3.2-11b-vision-instruct (Alt Text Generation)
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ step.do:         │
│ "check safety"   │──► Workers AI: @cf/meta/llama-guard-3-8b (Content Moderation)
└─────────┬────────┘
          │
     ┌────┴────────────────────────┐
     │                             │
[ Flagged Unsafe ]            [ Passed Safety ]
     │                             │
     ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│ step.do:         │         │ step.do:         │
│ "reject post"    │         │ "index-search"   │──► Workers AI: @cf/baai/bge-small-en-v1.5
└──────────────────┘         └─────────┬────────┘    (384-dim embedding -> Cloudflare Vectorize)
                                       │
                                       ▼
                             ┌──────────────────┐
                             │ step.do:         │
                             │ "publish post"   │──► D1 SQLite UPDATE status = 'public'
                             └──────────────────┘
```

1. **Stateful Reliability**: Cloudflare Workflows provide a zero-loss state machine with exponential retry backoff (`retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }`).
2. **Administrative Override**: If an administrator approves or denies a pending post from the Admin console before workflow execution finishes, the workflow recognizes the state update and halts to respect the owner's manual review.
3. **Graceful Local Dev Fallback**: In local development environments where Workers AI requires remote credentials, the pipeline transparently bypasses the AI inference step and marks the item `status: 'public'` with a `local dev` audit note.

---

## Stateful SQLite Durable Objects

Real-time chat functionality (`app/src/worker/durable/chat-room.ts`) is powered by Cloudflare's **SQLite-backed Durable Objects** with the **WebSocket Hibernation API**:

```typescript
export class ChatRoom extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    // Runtime responds to keep-alive pings without waking the DO from hibernation
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL
    )`);
  }
}
```

* **Zero-Cost Idle Connections**: Unlike traditional Node.js/Socket.io servers that consume RAM continuously for open TCP connections, Cloudflare WebSocket Hibernation evicts the isolate while retaining the socket handle in edge memory.
* **Automatic Runtime Heartbeats**: `ctx.setWebSocketAutoResponse` delegates ping/pong heartbeats to the C++ runtime layer, spending **zero GB-seconds** of compute while clients remain connected.
* **Tab De-duplication**: Sockets are tracked per user ID. If a user opens more than 3 concurrent tabs in a room, the oldest connection is gracefully closed with code `4409` (`CHAT_TAB_REPLACED`), preventing client connection leaks.

---

## Visual Showcase

<div align="center">

### Complete Inventory of 82 Cloudflare Offerings
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/score-dark.png">
  <img src="docs/images/score-light.png" width="85%" alt="Cloudflare-Free Offerings Scoreboard">
</picture>

<br><br>

### Community Feed, Real-time Chat &amp; Edge Lab
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/tour-dark.webp">
  <img src="docs/images/tour-light.webp" width="85%" alt="Cloudflare-Free Mobile UI Tour">
</picture>

<p><sub><b>Figure 2:</b> Authentic application captures demonstrating community feed with AI moderation, real-time Durable Object chat, and edge diagnostic lab.</sub></p>

</div>

---

## Verification & Workerd Test Suite

All serverless logic, authentication flows, database transactions, queue dispatches, and workflow transitions are validated against Cloudflare's actual open-source edge runtime, **workerd**, via `@cloudflare/vitest-plugin`.

<br>

<div align="center">
  <img src="assets/terminal_tests.png" width="100%" alt="62 Passing Tests in workerd">
  <p><sub><b>Figure 3:</b> Authentic test execution capture: 6 test suites, 62 tests passing in workerd isolated runtime.</sub></p>
</div>

<br>

### Test Suite Breakdown

| Test File | Test Count | Target Scope & Verification Invariants |
|---|---|---|
| [`app/test/units.test.ts`](app/test/units.test.ts) | **25 tests** | Session HMAC token validation, replay attack guards, D1 SQL statement parameter binding, KV preview TTL caching, rate-limit computation. |
| [`app/test/admin.test.ts`](app/test/admin.test.ts) | **1 test** | Owner review RBAC, post publication from Admin console, 404 validation for unknown identifiers. |
| [`app/test/media.test.ts`](app/test/media.test.ts) | **4 tests** | R2 bucket byte streaming, responsive image variant generation (320/640/1280px), Cache API edge response caching. |
| [`app/test/chat.test.ts`](app/test/chat.test.ts) | **3 tests** | SQLite Durable Object state persistence, WebSocket hibernation lifecycle, message history truncation. |
| [`app/test/workflow.test.ts`](app/test/workflow.test.ts) | **6 tests** | Cloudflare Workflows step sequencing, AI safety failure handling, local development bypass fallback. |
| [`app/test/api.test.ts`](app/test/api.test.ts) | **23 tests** | Full REST API surface, WebAuthn registration/authentication ceremony, Turnstile token verification, Queue & Dead-Letter delivery. |
| **Total** | **62 passed** | **100% passing across all isolated workerd test suites.** |

---

## Local Quickstart

### Prerequisites
* **Node.js**: `22.18.0` or newer
* **npm**: `10.0.0` or newer

```bash
# 1. Clone the repository
git clone https://github.com/BennyWaitWhat/Cloudflare-Free.git
cd Cloudflare-Free/app

# 2. Install dependencies
npm ci

# 3. Initialize local environment (.dev.vars and D1 SQLite tables)
npm run setup

# 4. Launch the local edge server
npm run dev
```

Visit `http://localhost:5173`. Everything runs locally with no Cloudflare account required—including D1 SQLite, KV, R2 storage, Queues, Durable Objects, and Workflows.

### Useful Development Commands

```bash
# Populate local instance with demo data (members, photo posts, chat history)
npm run demo

# Execute complete test suite inside workerd
npm test

# Run full TypeScript typecheck across Worker, Client, and Scripts
npm run typecheck

# Execute comprehensive pre-push gate (typecheck, tests, and production build)
npm run check
```

---

## Production Zero-Cost Deployment

<details>
<summary><b>1. Deploy on Free <code>*.workers.dev</code> Subdomain</b></summary>
<br>

Run commands from the `app/` directory:

1. **Authenticate Wrangler CLI**:
   ```bash
   npx wrangler login
   ```
2. **Enable R2 Storage**: Enable R2 in the Cloudflare dashboard (free allowance includes 10 GB-month and zero egress fees).
3. **Provision Vectorize Index**:
   ```bash
   npx wrangler vectorize create cloudflare-free-search --dimensions=384 --metric=cosine
   ```
4. **Configure Turnstile**: Create a free Turnstile widget in the dashboard and replace the test key in `app/wrangler.jsonc` (`TURNSTILE_SITE_KEY`).
5. **Deploy Infrastructure & Migrate Schema**:
   ```bash
   npm run deploy
   ```
6. **Set Production Secrets**:
   ```bash
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```
7. **Assign Admin Privileges**: Sign up via passkey on your deployed site, copy your immutable member ID from the Account screen, add it to `ADMIN_USER_IDS` in `app/wrangler.jsonc`, and re-deploy.

</details>

<details>
<summary><b>2. Custom Domain Free Offerings (Email Routing, DNSSEC, WAF)</b></summary>
<br>

When routing traffic through a custom domain on Cloudflare's free plan:

1. **DNS & Security**: Enable DNSSEC, minimum TLS 1.2, HTTP/3, and Certificate Transparency Monitoring.
2. **Inbound Email Routing**: Enable Email Routing to forward inbound messages directly to the `cloudflare-free` Email Worker, automatically parsing them into the Admin inbox.
3. **Edge WAF & Bot Defense**: Configure 5 free WAF rules, AI bot scrapers blocking, and Cloudflare Turnstile verification.
4. **Custom Domain Route**: Bind your apex domain in `app/wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "yourdomain.com", "custom_domain": true }]
   ```

</details>

---

## Repository Structure

```text
Cloudflare-Free/
├── assets/
│   ├── hero.png              # High-impact 1600x640 bespoke edge architecture hero
│   ├── architecture.svg      # High-contrast XML SVG system architecture diagram
│   └── terminal_tests.png    # Authentic vitest test execution capture (62 passing)
├── app/
│   ├── src/
│   │   ├── worker/           # Hono API router, Durable Objects, Workflows, Queues
│   │   │   ├── durable/      # ChatRoom actor with embedded SQLite & WebSocket Hibernation
│   │   │   ├── workflows/    # ModeratePostWorkflow (Vision AI -> Safety -> Vectorize)
│   │   │   ├── routes/       # Auth, posts, media, chat, AI, admin, contact
│   │   │   └── lib/          # AI clients, HMAC session tokens, rate guards, preview
│   │   ├── client/           # React 19 SPA (Pages, components, passkey hooks)
│   │   └── shared/           # Catalog of 82 free Cloudflare offerings & shared types
│   ├── migrations/           # D1 SQLite database schema (0001_init, 0002_budgets)
│   ├── public/               # Static assets, Web Manifest, service worker, icons
│   ├── test/                 # Vitest test suites executing in workerd
│   ├── wrangler.jsonc        # Cloudflare Workers configuration & resource bindings
│   └── package.json          # Dependencies & scripts
└── docs/
    ├── how-it-works.md       # Technical walkthroughs per architectural subsystem
    ├── diagrams/             # Archify diagram source specifications
    ├── research/             # Comprehensive Cloudflare free-tier capability study
    └── images/               # Production UI screenshots and subsystem diagrams
```

---

## License & Disclaimers

This project is open-source under the MIT License.

*Built with [Hono](https://hono.dev), [React 19](https://react.dev), [SimpleWebAuthn](https://simplewebauthn.dev), and [Cloudflare Workers](https://workers.cloudflare.com).*<br>
*Cloudflare and Cloudflare Workers are trademarks of Cloudflare, Inc. This project is an independent open-source technical showcase and is not affiliated with or endorsed by Cloudflare, Inc.*
