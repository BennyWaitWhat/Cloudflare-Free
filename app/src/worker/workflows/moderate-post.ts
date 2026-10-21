import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Bindings } from "../env";
import { aiOptions, MODELS, moderate, runsOnlyOnCloudflare } from "../lib/ai";
import { track } from "../lib/analytics";
import { indexForSearch } from "../lib/posts";

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
 * Every new post runs through this Workflow: alt text for its photo, an AI
 * safety check of the title, body and photo description together, a search
 * embedding, then publish. About 5 steps per post against the free 3,000
 * steps a day. Reject and publish only change a post that is still pending,
 * so a decision the owner made on the Admin page always stands.
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

    const imageKey = post.image_key;
    const altText = imageKey ? await step.do("describe photo", RETRY, () => this.describePhoto(imageKey)) : null;
    const text = [post.title, post.body].filter(Boolean).join("\n\n");
    const screened = altText ? `${text}\n\nPhoto: ${altText}` : text;

    // Workers AI only runs on Cloudflare's network, so local dev publishes without the check.
    const verdict = await step.do("check safety", RETRY, async () => {
      try {
        return { ...(await moderate(this.env, screened)), skipped: false };
      } catch (error) {
        if (runsOnlyOnCloudflare(error)) return { safe: true, categories: [] as string[], skipped: true };
        throw error;
      }
    });
    if (!verdict.safe) {
      await step.do("reject post", async () => {
        await this.env.DB.prepare("UPDATE posts SET status = 'rejected', moderation_note = ? WHERE id = ? AND status = 'pending'")
          .bind(`Flagged by the safety model (${verdict.categories.join(", ") || "unsafe"})`, post.id)
          .run();
      });
      return { status: "rejected" };
    }

    // A photo the vision model couldn't describe was never really checked, so the owner decides.
    if (imageKey && !altText && !verdict.skipped) {
      await step.do("hold for review", async () => {
        await this.env.DB.prepare("UPDATE posts SET moderation_note = ? WHERE id = ? AND status = 'pending'")
          .bind("The photo could not be checked; the site owner can publish it from the Admin page", post.id)
          .run();
      });
      return { status: "pending" };
    }

    const indexed = await step.do("index for search", RETRY, () => indexForSearch(this.env, post.id, post.kind, text));

    const published = await step.do("publish post", async () => {
      const { meta } = await this.env.DB.prepare(
        "UPDATE posts SET status = 'published', published_at = unixepoch(), image_alt = COALESCE(?, image_alt), moderation_note = ? WHERE id = ? AND status = 'pending'",
      )
        .bind(altText, verdict.skipped ? "Published without AI checks (local dev)" : null, post.id)
        .run();
      if (meta.changes > 0) track(this.env, "post_published", { detail: post.kind, userId: post.author_id });
      return meta.changes > 0;
    });
    return { status: published ? "published" : "decided by the owner", indexed };
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
}
