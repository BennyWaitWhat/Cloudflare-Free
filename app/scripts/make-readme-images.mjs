// Makes the README images in ../docs/images from the running dev site, in light and dark:
// a hero shot (desktop and phone), a tour of three phone screens, and the scoreboard bar.
// Run `npm run dev` and `npm run demo` first, then `npm run readme:images` (Node 22.18+).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG, STATUS_LABELS, score } from "../src/shared/catalog.ts";
import { launch } from "./chrome.mjs";
import { SITE, sessionCookie } from "./seed-demo.mjs";

const OUT = fileURLToPath(new URL("../../docs/images/", import.meta.url));
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, mobile: true };

// Local dev reads the visitor's real location from Cloudflare, so the edge card gets none.
const NO_LOCATION = { colo: null, city: null, country: null, httpProtocol: null, tlsVersion: null, asOrganization: null };

const STATUS_ORDER = ["live", "setup", "card", "domain", "planned", "skipped"];

// The site's own colors (src/client/styles.css) plus the backdrop for each theme.
const THEMES = {
  light: {
    bg: "#fbf8f4",
    surface: "#ffffff",
    surface2: "#f3eee8",
    text: "#1f1a17",
    muted: "#6b625c",
    border: "#e6ddd4",
    accent: "#c2410c",
    status: { live: "#15803d", setup: "#2563eb", card: "#7c3aed", domain: "#c2410c", planned: "#a8a29e", skipped: "#d6d3d1" },
    backdrop:
      "radial-gradient(900px 480px at 8% -6%, rgba(251,146,60,.38), transparent 70%), radial-gradient(760px 520px at 104% 108%, rgba(234,88,12,.30), transparent 70%), linear-gradient(155deg, #fff9f3 0%, #fdf0e4 55%, #fbe6d4 100%)",
    edge: "rgba(194,65,12,.14)",
    dots: "rgba(154,52,18,.16)",
    windowShadow: "0 0 0 1px rgba(31,26,23,.08), 0 22px 44px -18px rgba(124,45,18,.35), 0 60px 110px -40px rgba(124,45,18,.45)",
    phoneShadow: "0 26px 50px -18px rgba(124,45,18,.45), 0 70px 120px -40px rgba(124,45,18,.5)",
    rim: "#c9c2bc",
  },
  dark: {
    bg: "#141110",
    surface: "#1d1917",
    surface2: "#26211e",
    text: "#f2ede9",
    muted: "#a8a09a",
    border: "#35302c",
    accent: "#fb923c",
    status: { live: "#15803d", setup: "#2563eb", card: "#7c3aed", domain: "#c2410c", planned: "#78716c", skipped: "#44403c" },
    backdrop:
      "radial-gradient(900px 480px at 8% -6%, rgba(249,115,22,.30), transparent 70%), radial-gradient(760px 520px at 104% 108%, rgba(234,88,12,.24), transparent 70%), linear-gradient(155deg, #211814 0%, #17110e 55%, #120d0b 100%)",
    edge: "rgba(251,146,60,.18)",
    dots: "rgba(251,146,60,.13)",
    windowShadow: "0 0 0 1px rgba(255,255,255,.08), 0 22px 44px -18px rgba(0,0,0,.65), 0 60px 110px -40px rgba(0,0,0,.75)",
    phoneShadow: "0 26px 50px -18px rgba(0,0,0,.7), 0 70px 120px -40px rgba(0,0,0,.75)",
    rim: "#4a443f",
  },
};

const LOCK = `<svg width="10" height="12" viewBox="0 0 10 12"><path d="M2.5 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x=".5" y="5" width="9" height="6.5" rx="1.6" fill="currentColor"/></svg>`;
const SIGNAL = `<svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" width="3" height="11" rx="1"/></svg>`;
const WIFI = `<svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.3c2.1 0 4 .8 5.4 2.1l1.1-1.1A9.6 9.6 0 0 0 7.5.7 9.6 9.6 0 0 0 1 3.3l1.1 1.1a7.9 7.9 0 0 1 5.4-2.1Zm0 3.1c1.3 0 2.5.5 3.3 1.3l1.1-1.1a6.4 6.4 0 0 0-8.8 0l1.1 1.1c.8-.8 2-1.3 3.3-1.3Zm0 3.1c-.6 0-1.2.2-1.6.6l1.6 1.7 1.6-1.7c-.4-.4-1-.6-1.6-.6Z"/></svg>`;
const BATTERY = `<svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor"><rect x=".5" y=".5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="2"/><path d="M23 4v4c.8-.3 1.4-1.1 1.4-2S23.8 4.3 23 4Z" opacity=".4"/></svg>`;

const dataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

// ---- Page screenshots ----

const clickButton = (label) =>
  `[...document.querySelectorAll("button")].find((button) => button.textContent.trim() === ${JSON.stringify(label)}).click()`;

/** Sets a React-controlled input the way typing would. */
const fill = (selector, value) => `(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`;

/** Scrolls so the element sits just below the sticky top bar. */
const scrollTo = (element) => `(() => {
  const target = ${element};
  const bar = document.querySelector(".topbar").getBoundingClientRect().height;
  window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - bar - 14);
})()`;

// Images in view must finish loading; the first resize of each photo takes a few seconds locally.
const IMAGES_READY = `[...document.images]
  .filter((image) => { const box = image.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight; })
  .every((image) => image.complete && image.naturalWidth > 0)`;

const SHOTS = {
  home: { path: "/", viewport: DESKTOP, ready: "document.querySelector('.scorebar') && document.querySelectorAll('.tile').length === 4" },
  scoreboard: { path: "/scoreboard", viewport: PHONE, ready: "document.querySelectorAll('.offering').length > 10" },
  community: {
    path: "/community",
    viewport: PHONE,
    ready: "document.querySelectorAll('.post').length >= 4",
    async prepare(page) {
      await page.evaluate(scrollTo("document.querySelector('.post')"));
    },
  },
  chat: {
    path: "/community",
    viewport: PHONE,
    member: "richard",
    ready: "document.querySelectorAll('.chat-line').length >= 10 && /online/.test(document.querySelector('.chat-head .muted').textContent)",
    async prepare(page) {
      // The chat ends the page, so add room below it to scroll it up under the top bar.
      await page.evaluate("document.querySelector('.content').style.paddingBottom = '100vh'");
      await page.evaluate(scrollTo("document.querySelector('.chat')"));
    },
  },
  lab: {
    path: "/lab",
    viewport: PHONE,
    ready: "document.querySelectorAll('.card').length >= 8",
    async prepare(page) {
      await page.evaluate(clickButton("Look up"));
      await page.waitFor("document.querySelector('ul.plain code')");
      await page.evaluate(clickButton("Roll"));
      await page.waitFor("document.querySelector('.dice')");
      await page.evaluate(fill("input[type=url]", "https://blog.cloudflare.com/"));
      await page.evaluate(clickButton("Preview"));
      await page.waitFor("document.querySelector('.preview')", 30_000);
      await page.evaluate(scrollTo("document.querySelector('.preview').closest('.card')"));
    },
  },
};

async function capture(page, shot, scheme) {
  await page.send("Network.clearBrowserCookies");
  if (shot.member) {
    const [name, value] = sessionCookie(shot.member).split(/=(.*)/s);
    await page.send("Network.setCookie", { url: SITE, name, value });
  }
  await page.open(SITE + shot.path, { ...shot.viewport, scheme });
  await page.waitFor(shot.ready, 30_000);
  await shot.prepare?.(page);
  await page.waitFor(IMAGES_READY, 60_000);
  await page.evaluate("new Promise((done) => setTimeout(done, 500))");
  return page.screenshot();
}

// ---- Compositions ----

function styles(theme) {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: ${theme.text}; }
.canvas { position: relative; overflow: hidden; border-radius: 28px; background: ${theme.backdrop}; box-shadow: inset 0 0 0 1px ${theme.edge}; }
.dots { position: absolute; inset: 0; background-image: radial-gradient(${theme.dots} 1.1px, transparent 1.4px); background-size: 22px 22px; -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 45%, transparent 10%, #000 100%); }
.window { position: absolute; border-radius: 14px; overflow: hidden; background: ${theme.surface}; box-shadow: ${theme.windowShadow}; }
.bar { position: relative; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: ${theme.surface2}; border-bottom: 1px solid ${theme.border}; }
.bar i { width: 12px; height: 12px; border-radius: 50%; }
.address { position: absolute; left: 50%; top: 7px; transform: translateX(-50%); width: 300px; height: 26px; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; background: ${theme.surface}; border: 1px solid ${theme.border}; color: ${theme.muted}; font-size: 12.5px; font-weight: 500; }
.window img, .screen img { display: block; width: 100%; }
.phone { position: absolute; padding: 10px; border-radius: 50px; background: #0c0a09; box-shadow: 0 0 0 2px ${theme.rim}, ${theme.phoneShadow}; }
.screen { position: relative; height: 100%; border-radius: 40px; overflow: hidden; background: ${theme.bg}; }
.status { height: 36px; display: flex; align-items: center; justify-content: space-between; padding: 2px 24px 0 30px; font-size: 13.5px; font-weight: 600; }
.status span:last-child { display: flex; gap: 5px; align-items: center; }
.island { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 86px; height: 25px; border-radius: 13px; background: #000; }
.caption { position: absolute; text-align: center; }
.caption strong { display: block; font-size: 18px; font-weight: 650; letter-spacing: -0.01em; }
.caption span { display: block; margin-top: 4px; font-size: 14px; color: ${theme.muted}; }
`;
}

const page = (theme, width, height, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${styles(theme)}</style></head><body><div class="canvas" style="width:${width}px;height:${height}px"><div class="dots"></div>${body}</div></body></html>`;

const browserWindow = (png, { left, top, width }) => `
<div class="window" style="left:${left}px;top:${top}px;width:${width}px">
  <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
    <div class="address">${LOCK}<span>Cloudflare Free</span></div></div>
  <img src="${dataUrl(png)}">
</div>`;

const phone = (png, { left, top, width }) => `
<div class="phone" style="left:${left}px;top:${top}px;width:${width}px;height:${Math.round(width * 2.06)}px">
  <div class="screen">
    <div class="status"><span>9:41</span><span>${SIGNAL}${WIFI}${BATTERY}</span></div>
    <div class="island"></div>
    <img src="${dataUrl(png)}">
  </div>
</div>`;

function heroHtml(theme, shots) {
  return page(
    theme,
    1200,
    700,
    // The phone overlaps the window enough to hide the desktop "Sign in" button behind it.
    browserWindow(shots.home, { left: 69, top: 58, width: 880 }) + phone(shots.scoreboard, { left: 859, top: 96, width: 272 }),
  );
}

function tourHtml(theme, shots) {
  const screens = [
    { png: shots.community, title: "Community", text: "Photo posts, checked by an AI Workflow" },
    { png: shots.chat, title: "Live chat", text: "Every room is a Durable Object" },
    { png: shots.lab, title: "Lab", text: "Free Cloudflare APIs to try" },
  ];
  return page(
    theme,
    1200,
    792,
    screens
      .map(({ png, title, text }, index) => {
        const left = 70 + index * 380;
        return (
          phone(png, { left, top: index === 1 ? 40 : 72, width: 300 }) +
          `<div class="caption" style="left:${left}px;top:716px;width:300px"><strong>${title}</strong><span>${text}</span></div>`
        );
      })
      .join(""),
  );
}

function scoreHtml(theme) {
  const totals = score(CATALOG);
  const parts = STATUS_ORDER.filter((status) => totals.byStatus[status] > 0)
    .map((status) => `<span style="flex-grow:${totals.byStatus[status]};background:${theme.status[status]}"></span>`)
    .join("");
  const legend = STATUS_ORDER.map(
    (status) => `<li><i style="background:${theme.status[status]}"></i>${STATUS_LABELS[status]} <b>${totals.byStatus[status]}</b></li>`,
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles(theme)}
.score { width: 760px; padding: 8px 6px; }
.score p { text-align: center; font-size: 16px; color: ${theme.muted}; margin-bottom: 14px; }
.score p b { color: ${theme.accent}; font-size: 22px; font-weight: 750; margin-right: 4px; }
.track { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: ${theme.surface2}; }
.track span { min-width: 4px; }
ul { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; list-style: none; margin-top: 14px; font-size: 13.5px; color: ${theme.muted}; }
li { display: flex; align-items: center; gap: 6px; }
li i { width: 10px; height: 10px; border-radius: 50%; }
li b { color: ${theme.text}; font-weight: 650; }
</style></head><body><div class="score"><p><b>${totals.built} of ${totals.total}</b> free Cloudflare products have working code</p><div class="track">${parts}</div><ul>${legend}</ul></div></body></html>`;
}

/** Renders HTML and captures the first element under body. */
async function render(browserPage, html, width, format) {
  await browserPage.open("about:blank", { width, height: 900, scale: 2, transparent: true });
  await browserPage.setContent(html);
  await browserPage.waitFor("[...document.images].every((image) => image.complete && image.naturalWidth > 0)");
  const box = await browserPage.evaluate(
    "(() => { const { x, y, width, height } = document.body.firstElementChild.getBoundingClientRect(); return { x, y, width, height }; })()",
  );
  return browserPage.screenshot({ format, quality: format === "webp" ? 90 : undefined, clip: box });
}

async function main() {
  await fetch(`${SITE}/api/health`).catch(() => {
    throw new Error(`Nothing answered at ${SITE}; start the site with npm run dev first`);
  });
  mkdirSync(OUT, { recursive: true });
  const { page: browserPage, close } = await launch();
  try {
    await browserPage.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/tools/trace*" }] });
    browserPage.on("Fetch.requestPaused", ({ requestId }) =>
      browserPage.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(NO_LOCATION)).toString("base64"),
      }),
    );

    for (const [scheme, theme] of Object.entries(THEMES)) {
      const shots = {};
      for (const [name, shot] of Object.entries(SHOTS)) shots[name] = await capture(browserPage, shot, scheme);
      const images = {
        [`hero-${scheme}.webp`]: await render(browserPage, heroHtml(theme, shots), 1200, "webp"),
        [`tour-${scheme}.webp`]: await render(browserPage, tourHtml(theme, shots), 1200, "webp"),
        [`score-${scheme}.png`]: await render(browserPage, scoreHtml(theme), 780, "png"),
      };
      for (const [file, bytes] of Object.entries(images)) {
        writeFileSync(join(OUT, file), bytes);
        console.log(`docs/images/${file}: ${Math.round(bytes.length / 1024)} KB`);
      }
    }
  } finally {
    await close();
  }
}

await main();
