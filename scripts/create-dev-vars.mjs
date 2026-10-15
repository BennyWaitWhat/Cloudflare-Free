// Creates .dev.vars, the git-ignored file of local secrets that `npm run dev` reads.
// Run with `npm run setup`; an existing .dev.vars is left as it is.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const lines = [
  "# Local development only. In production set these with `npx wrangler secret put <NAME>`.",
  `SESSION_SECRET=${randomBytes(48).toString("base64url")}`,
  "",
  "# Cloudflare's published always-pass Turnstile test secret.",
  "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
  "",
  "# Usernames that get the admin role locally.",
  "ADMIN_USERNAMES=owner",
];

try {
  writeFileSync(new URL("../.dev.vars", import.meta.url), `${lines.join("\n")}\n`, { flag: "wx" });
  console.log("Created .dev.vars with a random SESSION_SECRET.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".dev.vars already exists; left it unchanged.");
}
