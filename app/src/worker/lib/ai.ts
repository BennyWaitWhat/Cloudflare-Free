import type { Bindings } from "../env";

// Free-tier models (none of the Workers Paid-only models). One shared
// budget of 10,000 Neurons/day covers all of them; calls past it get HTTP 429.
export const MODELS = {
  chat: "@cf/zai-org/glm-4.7-flash",
  moderation: "@cf/meta/llama-guard-3-8b",
  embedding: "@cf/baai/bge-small-en-v1.5",
  image: "@cf/black-forest-labs/flux-1-schnell",
  vision: "@cf/llava-hf/llava-1.5-7b-hf",
} as const;

/** bge-small vectors are 384-dimensional; the Vectorize index must match. */
export const EMBEDDING_DIMENSIONS = 384;

/** True for the error a remote-only binding such as Workers AI throws in local dev and tests. */
export const runsOnlyOnCloudflare = (error: unknown) => /needs to be run remotely/i.test(String(error));

/** Routes Workers AI through AI Gateway when AI_GATEWAY_ID is set. */
export function aiOptions(env: Bindings, tag: string): AiOptions {
  const options: AiOptions = { tags: [tag] };
  if (env.AI_GATEWAY_ID) options.gateway = { id: env.AI_GATEWAY_ID };
  return options;
}

export async function embed(env: Bindings, texts: string[]): Promise<number[][]> {
  const output = await env.AI.run(MODELS.embedding, { text: texts }, aiOptions(env, "embed"));
  if (!("data" in output) || !output.data?.length) throw new Error("The embedding model returned no vectors");
  return output.data;
}

export interface ModerationVerdict {
  safe: boolean;
  categories: string[];
}

const MAX_MODERATED_CHARS = 6000; // 140 title + 5,000 body + photo description

/** Llama Guard reads the whole text; anything longer than a post can be is refused unread. */
export async function moderate(env: Bindings, text: string): Promise<ModerationVerdict> {
  if (text.length > MAX_MODERATED_CHARS) return { safe: false, categories: ["too-long"] };
  const output = await env.AI.run(
    MODELS.moderation,
    { messages: [{ role: "user", content: text }], max_tokens: 32 },
    aiOptions(env, "moderation"),
  );
  const verdict = output.response;
  if (verdict && typeof verdict === "object") {
    return { safe: verdict.safe !== false, categories: verdict.categories ?? [] };
  }
  if (typeof verdict === "string" && /\bunsafe\b/i.test(verdict)) {
    return { safe: false, categories: verdict.match(/S\d+/g) ?? [] };
  }
  return { safe: true, categories: [] };
}

/**
 * Workers AI streams server-sent events in two shapes: `{response}` for
 * classic models and OpenAI-style `{choices[0].delta.content}` for newer
 * ones. This turns either into a plain text stream for the web app.
 */
export function eventStreamToText(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const text = textFromEvent(line);
          if (text) controller.enqueue(encoder.encode(text));
        }
      },
      flush(controller) {
        const text = textFromEvent(buffer);
        if (text) controller.enqueue(encoder.encode(text));
      },
    }),
  );
}

export function textFromEvent(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return "";
  try {
    const event = JSON.parse(data) as {
      response?: unknown;
      choices?: { delta?: { content?: unknown } }[];
    };
    if (typeof event.response === "string") return event.response;
    const content = event.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}
