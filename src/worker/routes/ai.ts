import { Hono } from "hono";
import type { AppEnv, Bindings } from "../env";
import { CATALOG, STATUS_LABELS, score, type Status } from "../../shared/catalog";
import { aiOptions, embed, eventStreamToText, MODELS, moderate } from "../lib/ai";
import { track } from "../lib/analytics";
import { fromBase64 } from "../lib/encoding";
import { enforceLimit } from "../lib/guards";
import { clientIp, country, fail, readBody, requiredText } from "../lib/http";
import { POST_SELECT, toPublicPost, type PostRow } from "../lib/posts";

export const ai = new Hono<AppEnv>();

type ChatTurn = { role: "user" | "assistant"; content: string };

function cleanMessages(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) fail(400, "Send a list of messages");
  const turns = value
    .filter((turn): turn is ChatTurn =>
      Boolean(turn) &&
      (turn.role === "user" || turn.role === "assistant") &&
      typeof turn.content === "string" &&
      turn.content.trim().length > 0,
    )
    .slice(-8)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));
  if (turns.at(-1)?.role !== "user") fail(400, "The last message must come from you");
  return turns;
}

/** Product list grouped by status, kept short to save Neurons on every chat. */
function catalogSummary(): string {
  const groups = new Map<Status, string[]>();
  for (const offering of CATALOG) {
    groups.set(offering.status, [...(groups.get(offering.status) ?? []), offering.name]);
  }
  return [...groups].map(([status, names]) => `${STATUS_LABELS[status]}: ${names.join(", ")}`).join("\n");
}

/** Finds published posts related to a question; returns nothing if the Vectorize index isn't set up. */
async function relatedPosts(env: Bindings, question: string, limit: number) {
  try {
    const [vector] = await embed(env, [question]);
    const found = await env.SEARCH_INDEX.query(vector, { topK: limit });
    const ids = found.matches.map((match) => match.id);
    if (ids.length === 0) return [];
    const { results } = await env.DB.prepare(
      `${POST_SELECT} WHERE p.id IN (${ids.map(() => "?").join(",")}) AND p.status = 'published'`,
    )
      .bind(...ids)
      .all<PostRow>();
    const byId = new Map(results.map((row) => [row.id, row]));
    return found.matches.flatMap((match) => {
      const row = byId.get(match.id);
      return row ? [{ score: match.score, post: toPublicPost(row) }] : [];
    });
  } catch (error) {
    console.warn("semantic search unavailable", error);
    return null;
  }
}

ai.post("/chat", async (c) => {
  await enforceLimit(c.env.AI_LIMITER, `chat:${clientIp(c)}`);
  const body = await readBody(c);
  const turns = cleanMessages(body.messages);
  const related = (await relatedPosts(c.env, turns.at(-1)!.content, 3)) ?? [];
  const context = related
    .map(({ post }) => `- ${post.title ?? "Post"} by ${post.author.displayName}: ${post.body.slice(0, 300)}`)
    .join("\n");
  const { total, built, remaining } = score();
  const system = [
    `You are the assistant on ${c.env.SITE_NAME}, a website and installable web app built only from Cloudflare's free tier.`,
    `It tracks ${total} free Cloudflare offerings: ${built} have working code here and ${remaining} are planned.`,
    "Answer briefly and plainly. If you don't know something, say so; never invent Cloudflare limits or prices.",
    `Offerings by status:\n${catalogSummary()}`,
    context ? `Related posts on this site:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = (await c.env.AI.run(
    MODELS.chat,
    {
      messages: [{ role: "system", content: system }, ...turns],
      stream: true,
      max_tokens: 600,
      chat_template_kwargs: { enable_thinking: false },
    },
    aiOptions(c.env, "chat"),
  )) as unknown as ReadableStream<Uint8Array>;

  track(c.env, "ai_chat", { country: country(c) });
  return new Response(eventStreamToText(stream), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
});

ai.post("/image", async (c) => {
  await enforceLimit(c.env.AI_LIMITER, `image:${clientIp(c)}`);
  const body = await readBody(c);
  const prompt = requiredText(body.prompt, "Prompt", 3, 500);
  const verdict = await moderate(c.env, prompt);
  if (!verdict.safe) fail(422, "That prompt was flagged by the safety model; try something else");

  const output = await c.env.AI.run(MODELS.image, { prompt, steps: 4 }, aiOptions(c.env, "image"));
  if (!output.image) fail(502, "The image model returned nothing");
  track(c.env, "ai_image", { country: country(c) });
  return new Response(fromBase64(output.image), {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
  });
});

ai.get("/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim().slice(0, 200);
  if (query.length < 2) return c.json({ results: [] });
  await enforceLimit(c.env.AI_LIMITER, `search:${clientIp(c)}`);
  const results = await relatedPosts(c.env, query, 8);
  if (results === null) fail(503, "Search isn't set up yet: create the Vectorize index (see README)");
  track(c.env, "search", { country: country(c) });
  return c.json({ results });
});

ai.post("/markdown", async (c) => {
  await enforceLimit(c.env.AI_LIMITER, `markdown:${clientIp(c)}`);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail(400, "Attach a document");
  if (file.size > 5 * 1024 * 1024) fail(413, "Documents must be under 5 MB");
  if (file.type.startsWith("image/")) fail(415, "Images spend AI Neurons to convert; try a PDF, Office, HTML or CSV file");

  const result = await c.env.AI.toMarkdown({ name: file.name, blob: file });
  if (result.format === "error") fail(422, result.error);
  track(c.env, "markdown", { detail: result.mimeType, country: country(c) });
  return c.json({ name: result.name, mimeType: result.mimeType, tokens: result.tokens, markdown: result.data });
});
