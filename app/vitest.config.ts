import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with local D1, KV, R2, Queues, Durable Objects and
// Workflows. Workers AI, Vectorize and Browser Run are remote-only and are
// mocked or skipped in tests.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/worker/index.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      remoteBindings: false,
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
          TURNSTILE_SECRET_KEY: "test-turnstile-secret",
          ADMIN_USER_IDS: "test-owner-id",
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
