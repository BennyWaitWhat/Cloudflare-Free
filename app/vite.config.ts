import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs the Worker inside workerd during `vite dev`
// and emits the Worker plus static assets for `wrangler deploy`.
// Workers AI, Vectorize and Browser Run only exist remotely, so they're
// reachable in dev only with `npm run dev:remote` (needs `wrangler login`).
export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflare({ remoteBindings: mode === "remote" })],
}));
