import type { LinkPreview } from "../../shared/types";
import { fail } from "./http";

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|lan|home\.arpa)$/i;
const MAX_HTML_BYTES = 256 * 1024;

/** Accepts only public http(s) URLs on standard ports, so the Worker can't be aimed at private hosts. */
export function parsePublicUrl(input: unknown): URL {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2048) fail(400, "Enter a URL");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    fail(400, "That doesn't look like a URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail(400, "Only http and https links work");
  if (url.username || url.password) fail(400, "Links with credentials aren't allowed");
  if (url.port && url.port !== "80" && url.port !== "443") fail(400, "Only standard ports are allowed");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST.test(host) || (!host.includes(".") && !host.startsWith("["))) {
    fail(400, "That host isn't on the public internet");
  }
  if (isPrivateAddress(host)) fail(400, "Private network addresses aren't allowed");
  url.hash = "";
  return url;
}

export function isPrivateAddress(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    return v6 === "::" || v6 === "::1" || v6.startsWith("::ffff:") || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  return false;
}

export async function fetchPreview(url: URL): Promise<LinkPreview> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CloudflareFreePreview/0.1)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    fail(502, "That site didn't answer in time");
  }
  if (!response.ok) fail(502, `That site answered with HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("application/xhtml")) fail(422, "That link isn't a web page");

  const html = await readHead(response);
  const meta: Record<string, string> = {};
  let title = "";
  await new HTMLRewriter()
    .on("meta", {
      element(element) {
        const key = (element.getAttribute("property") ?? element.getAttribute("name") ?? "").toLowerCase();
        const content = element.getAttribute("content");
        if (key && content && !(key in meta)) meta[key] = content;
      },
    })
    .on("title", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .transform(new Response(html, { headers: { "content-type": "text/html" } }))
    .text();

  const finalUrl = new URL(response.url || url.toString());
  const image = meta["og:image"] ?? meta["twitter:image"];
  return {
    url: finalUrl.toString(),
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? title, 200),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta["description"], 400),
    image: image ? absoluteHttpUrl(image, finalUrl) : null,
    siteName: clean(meta["og:site_name"], 100) ?? finalUrl.hostname,
  };
}

/** Reads until </head> or 256 KB, whichever comes first. */
async function readHead(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (html.includes("</head>")) break;
  }
  await reader.cancel().catch(() => undefined);
  return html;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };

function clean(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const text = value.replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function absoluteHttpUrl(value: string, base: URL): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
