import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Bindings } from "../env";
import { aiOptions, embed, MODELS, moderate } from "../lib/ai";
import { track } from "../lib/analytics";

export interface ModerateParams {
  postId: string;
}

interface PostForModeration {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_key: string | null;
  author_id: string;
}

const RETRY = {
  retries: { limit: 2, delay: "10 seconds" as const, backoff: "exponential" as const },
  timeout: "2 minutes" as const,
};

/**
 * Every new post runs through this Workflow: AI safety check, alt text for
 * its photo, a search embedding, then publish. About 5 steps per post against
 * the free 3,000 steps a day.
 */
export class ModeratePostWorkflow extends WorkflowEntrypoint<Bindings, ModerateParams> {
  async run(event: WorkflowEvent<ModerateParams>, step: WorkflowStep) {
    const post = await step.do("load post", async () => {
      const row = await this.env.DB.prepare("SELECT id, kind, title, body, image_key, author_id FROM posts WHERE id = ?")
        .bind(event.payload.postId)
        .first<PostForModeration>();
      if (!row) throw new NonRetryableError(`Post ${event.payload.postId} not found`);
      return row;
    });

    const text = [post.title, post.body].filter(Boolean).join("\n\n");
    const verdict = await step.do("check safety", RETRY, () => moderate(this.env, text));
    if (!verdict.safe) {
      await step.do("reject post", async () => {
        await this.env.DB.prepare("UPDATE posts SET status = 'rejected', moderation_note = ? WHERE id = ?")
          .bind(`Flagged by the safety model (${verdict.categories.join(", ") || "unsafe"})`, post.id)
          .run();
      });
      return { status: "rejected" };
    }

    const imageKey = post.image_key;
    const altText = imageKey ? await step.do("describe photo", RETRY, () => this.describePhoto(imageKey)) : null;
    const indexed = await step.do("index for search", RETRY, () => this.index(post.id, post.kind, text));

    await step.do("publish post", async () => {
      await this.env.DB.prepare(
        "UPDATE posts SET status = 'published', published_at = unixepoch(), image_alt = COALESCE(?, image_alt) WHERE id = ?",
      )
        .bind(altText, post.id)
        .run();
      track(this.env, "post_published", { detail: post.kind, userId: post.author_id });
    });
    return { status: "published", indexed };
  }

  /** Alt text from a vision model, fed a 640px JPEG (the same size the feed uses). */
  private async describePhoto(key: string): Promise<string | null> {
    const object = await this.env.MEDIA.get(key);
    if (!object) return null;
    try {
      const resized = await this.env.IMAGES.input(object.body).transform({ width: 640, fit: "scale-down" }).output({ format: "image/jpeg" });
      const bytes = new Uint8Array(await new Response(resized.image()).arrayBuffer());
      const output = await this.env.AI.run(
        MODELS.vision,
        { image: [...bytes], prompt: "Describe this photo in one short sentence for alt text.", max_tokens: 60 },
        aiOptions(this.env, "alt-text"),
      );
      return output.description.trim().slice(0, 200) || null;
    } catch (error) {
      console.warn("alt text unavailable", error);
      return null;
    }
  }

  /** Returns false when the Vectorize index hasn't been created yet. */
  private async index(id: string, kind: string, text: string): Promise<boolean> {
    try {
      const [values] = await embed(this.env, [text.slice(0, 2000)]);
      await this.env.SEARCH_INDEX.upsert([{ id, values, metadata: { kind } }]);
      return true;
    } catch (error) {
      console.warn("search indexing skipped", error);
      return false;
    }
  }
}
