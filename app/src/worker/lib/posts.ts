import type { Bindings } from "../env";
import type { PostKind, PostStatus, PublicPost } from "../../shared/types";
import { embed } from "./ai";

export const POST_SELECT = `
  SELECT p.id, p.kind, p.title, p.body, p.image_key, p.image_alt, p.status, p.moderation_note,
         p.created_at, p.published_at, u.username, u.display_name
  FROM posts p JOIN users u ON u.id = p.author_id`;

export interface PostRow {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  image_key: string | null;
  image_alt: string | null;
  status: PostStatus;
  moderation_note: string | null;
  created_at: number;
  published_at: number | null;
  username: string;
  display_name: string;
}

export function toPublicPost(row: PostRow): PublicPost {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    imageKey: row.image_key,
    imageAlt: row.image_alt,
    status: row.status,
    moderationNote: row.moderation_note,
    author: { username: row.username, displayName: row.display_name },
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

/** Adds a post to the search index; returns false when the Vectorize index hasn't been created yet. */
export async function indexForSearch(env: Bindings, id: string, kind: string, text: string): Promise<boolean> {
  try {
    const [values] = await embed(env, [text.slice(0, 2000)]);
    await env.SEARCH_INDEX.upsert([{ id, values, metadata: { kind } }]);
    return true;
  } catch (error) {
    console.warn("search indexing skipped", error);
    return false;
  }
}
