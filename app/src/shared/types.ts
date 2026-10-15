// Shapes shared by the Worker API and the web app.

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

export interface SiteConfig {
  siteName: string;
  turnstileSiteKey: string;
  webAnalyticsToken: string;
  user: SessionUser | null;
}

export type PostKind = "community" | "blog";
export type PostStatus = "pending" | "published" | "rejected";

export interface PublicPost {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  imageKey: string | null;
  imageAlt: string | null;
  status: PostStatus;
  moderationNote: string | null;
  author: { username: string; displayName: string };
  createdAt: number;
  publishedAt: number | null;
}

export interface ChatMessage {
  id: number;
  userId: string;
  name: string;
  username: string;
  text: string;
  at: number;
}

export type ChatEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "presence"; online: number }
  | { type: "error"; message: string };

export const CHAT_ROOMS = ["lobby", "showcase", "help", "off-topic"] as const;
export type ChatRoomName = (typeof CHAT_ROOMS)[number];

/** Widths the image route will resize to; fixed so each photo uses at most 3 of the 5,000 free monthly transformations. */
export const IMAGE_WIDTHS = [320, 640, 1280] as const;

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}
