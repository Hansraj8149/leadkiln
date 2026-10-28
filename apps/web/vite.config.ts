import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two entry points: the marketing page (plain HTML, no script, so search engines read it all) and the dashboard.
// In dev, /api goes to `wrangler dev` on port 8787.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
      },
    },
  },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
