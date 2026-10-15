import type { SessionUser } from "../shared/types";

/**
 * Values that are not declared in wrangler.jsonc: secrets set with
 * `wrangler secret put` (or .dev.vars locally) and the optional email binding
 * that can only be added once Email Routing is on for the domain.
 */
export interface ExtraBindings {
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** A verified Email Routing destination that receives owner notifications. */
  OWNER_EMAIL?: string;
  /** Sender address on your domain, e.g. site@example.com. */
  NOTIFY_FROM?: string;
  /** `send_email` binding named NOTIFY_EMAIL. */
  NOTIFY_EMAIL?: SendEmail;
}

export type Bindings = Env & ExtraBindings;

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: SessionUser | null };
};

export type JobMessage = {
  type: "contact";
  id: string;
  name: string;
  email: string;
  message: string;
  country: string | null;
  at: number;
};
