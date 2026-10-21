// Adds the site's favicon and a "Cloudflare Free / How it works" link bar to the Archify diagram pages
// in public/learn, and lets their zoom bar wrap on phones instead of running off-screen. Archify
// rebuilds a page from scratch, so run `npm run diagrams:brand` after rebuilding any diagram.
// Pages that already have the link bar are skipped, so running it twice changes nothing.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const LEARN = new URL("../public/learn/", import.meta.url);
const MARK = "cf-crumbs";
// The bar lines up with the diagram column, which the viewer sizes with --archify-reader-width on
// <html>. The link colors are the site's accent in each theme; the viewer sets data-theme on <html>.
const HEAD = `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>.cf-crumbs{display:flex;gap:.5rem;align-items:center;max-width:var(--archify-reader-width,1440px);margin:0 auto;padding:10px 0;font:600 14px/1.3 system-ui,sans-serif}.cf-crumbs a{color:#c2410c;text-decoration:none}[data-theme=dark] .cf-crumbs a{color:#fb923c}.cf-crumbs span{opacity:.5}@media (max-width:480px){.diagram-nav{flex-wrap:wrap;justify-content:center;row-gap:4px;overflow:visible}}</style>`;
const NAV = `<nav class="cf-crumbs" aria-label="Site"><a href="/">Cloudflare Free</a><span aria-hidden="true">/</span><a href="/how-it-works">How it works</a></nav>`;

const pages = readdirSync(LEARN).filter((file) => file.endsWith(".html"));
let branded = 0;
for (const file of pages) {
  const url = new URL(file, LEARN);
  const html = readFileSync(url, "utf8");
  if (html.includes(MARK)) continue;
  // The page's scripts can mention tags too, so use the first <body> and the </head> just before it.
  const body = html.match(/<body\b[^>]*>/);
  const head = body ? html.lastIndexOf("</head>", body.index) : -1;
  if (!body || head === -1) throw new Error(`${file} has no </head> and <body> to brand`);
  const afterBody = body.index + body[0].length;
  writeFileSync(url, html.slice(0, head) + HEAD + html.slice(head, afterBody) + NAV + html.slice(afterBody));
  branded++;
}
console.log(`Branded ${branded} of ${pages.length} diagram pages in public/learn`);
