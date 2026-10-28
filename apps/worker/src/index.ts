import { createApi } from "./api";
import type { Env, RunMessage } from "./env";
import { enqueueDue, runWorkspace } from "./run";

const api = createApi();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api.fetch(req, env, ctx);
    // The dashboard is a single-page app: every /app path serves its index.
    if (url.pathname === "/app" || url.pathname.startsWith("/app/"))
      return env.ASSETS.fetch(new Request(new URL("/app/", url), req));
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event, env) {
    await enqueueDue(env);
  },

  // One workspace per message, so one customer's failure can't block the others.
  async queue(batch, env) {
    for (const msg of batch.messages) {
      await runWorkspace(env, msg.body);
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, RunMessage>;
