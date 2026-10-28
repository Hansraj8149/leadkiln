// The hosted side of a run: the hourly cron queues due workspaces, the queue consumer runs one workspace through the
// engine, stores what it found, and sends the digest. Nothing is ever sent to a lead.
import { findLeads, leadKey, placeholders } from "@leadkiln/engine";
import { AnthropicModel, WorkersAiBinding, type TextModel } from "@leadkiln/llm";
import { newId } from "./crypto";
import { all, exec, nextRunAt, one, parseProfile, workspaceKeys, type AccountRow, type WorkspaceRow } from "./db";
import { sendDigest } from "./digest";
import type { Env, RunMessage } from "./env";
import { allowance, month, planFor } from "./plans";

export interface Deps {
  now: () => number;
  fetch: typeof fetch;
  model: (env: Env) => TextModel | null;
}

export function defaultModel(env: Env): TextModel | null {
  const id = env.LEADKILN_MODEL ?? "@cf/mistralai/mistral-small-3.1-24b-instruct";
  if (id.startsWith("claude")) return env.ANTHROPIC_API_KEY ? new AnthropicModel(env.ANTHROPIC_API_KEY, id) : null;
  return env.AI ? new WorkersAiBinding(env.AI as never, id) : null;
}

export const defaultDeps: Deps = { now: () => Date.now(), fetch: (...a) => fetch(...a), model: defaultModel };

export async function queueRun(env: Env, workspaceId: string, trigger: "schedule" | "manual", now: number) {
  const running = await one<{ id: string }>(
    env.DB,
    "SELECT id FROM runs WHERE workspace_id = ? AND status IN ('queued', 'running') AND created_at > ?",
    workspaceId,
    now - 30 * 60_000,
  );
  if (running) return running.id;
  const runId = newId();
  await exec(
    env.DB,
    "INSERT INTO runs (id, workspace_id, status, trigger, created_at) VALUES (?, ?, 'queued', ?, ?)",
    runId,
    workspaceId,
    trigger,
    now,
  );
  await env.RUNS.send({ workspaceId, runId });
  return runId;
}

/** Cron: every workspace whose daily run is due goes on the queue, and its next run moves a day on. */
export async function enqueueDue(env: Env, deps: Deps = defaultDeps) {
  const now = deps.now();
  const due = await all<WorkspaceRow>(
    env.DB,
    "SELECT * FROM workspaces WHERE paused = 0 AND next_run_at IS NOT NULL AND next_run_at <= ?",
    now,
  );
  for (const w of due) {
    await exec(env.DB, "UPDATE workspaces SET next_run_at = ? WHERE id = ?", nextRunAt(w.run_hour, now + 60_000), w.id);
    await queueRun(env, w.id, "schedule", now);
  }
  // A month of run history is plenty.
  await exec(env.DB, "DELETE FROM runs WHERE created_at < ?", now - 31 * 86_400_000);
  return due.length;
}

export async function runWorkspace(env: Env, msg: RunMessage, deps: Deps = defaultDeps) {
  const now = deps.now();
  const finish = (
    status: "done" | "failed",
    fields: { added?: number; sources?: unknown; error?: string; model?: string },
  ) =>
    exec(
      env.DB,
      "UPDATE runs SET status = ?, added = ?, sources = ?, error = ?, model = ?, finished_at = ? WHERE id = ?",
      status,
      fields.added ?? 0,
      JSON.stringify(fields.sources ?? []),
      fields.error?.slice(0, 500) ?? null,
      fields.model ?? null,
      deps.now(),
      msg.runId,
    );

  const ws = await one<WorkspaceRow & AccountRow>(
    env.DB,
    "SELECT w.*, a.plan, a.plan_status FROM workspaces w JOIN accounts a ON a.id = w.account_id WHERE w.id = ?",
    msg.workspaceId,
  );
  if (!ws) return;
  try {
    await exec(env.DB, "UPDATE runs SET status = 'running' WHERE id = ?", msg.runId);
    const profile = parseProfile(ws);
    if (placeholders(profile).length)
      return await finish("failed", { error: "The profile still has [placeholder] text. Finish it before a run." });
    const used = await one<{ leads: number }>(
      env.DB,
      "SELECT leads FROM usage WHERE account_id = ? AND month = ?",
      ws.account_id,
      month(now),
    );
    const { left, reason } = allowance(planFor(ws.plan), ws.plan_status, used?.leads ?? 0);
    if (!left) return await finish("failed", { error: reason });

    const model = deps.model(env);
    const out = await findLeads({
      profile,
      keys: await workspaceKeys(env, ws.id),
      model,
      limit: left,
      fetch: deps.fetch,
      now,
      known: async (keys) => {
        const rows = await all<{ source: string; source_id: string }>(
          env.DB,
          "SELECT source, source_id FROM leads WHERE workspace_id = ?",
          ws.id,
        );
        const set = new Set(rows.map((r) => leadKey({ source: r.source as never, sourceId: r.source_id })));
        return new Set(keys.filter((k) => set.has(k)));
      },
    });

    const added: string[] = [];
    for (const l of out.leads) {
      const id = newId();
      const res = await exec(
        env.DB,
        `INSERT INTO leads (id, workspace_id, source, source_id, url, title, body, author, contact, site_url, country, offer,
           score, why, facts, draft, posted_at, found_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, source, source_id) DO NOTHING`,
        id,
        ws.id,
        l.source,
        l.sourceId,
        l.url,
        l.title.slice(0, 300),
        l.body.slice(0, 2000),
        l.author ?? null,
        l.contact ?? null,
        l.siteUrl ?? null,
        l.country ?? null,
        l.offer,
        l.score,
        JSON.stringify(l.why),
        JSON.stringify(l.facts),
        l.draft,
        l.postedAt ?? null,
        now,
        now,
      );
      if (res.meta.changes) added.push(id);
    }
    if (added.length)
      await exec(
        env.DB,
        `INSERT INTO usage (account_id, month, leads) VALUES (?, ?, ?)
         ON CONFLICT (account_id, month) DO UPDATE SET leads = leads + excluded.leads`,
        ws.account_id,
        month(now),
        added.length,
      );
    await finish("done", { added: added.length, sources: out.sources, model: model?.name });
    if (added.length) await sendDigest(env, ws, profile, added, deps.fetch);
  } catch (e) {
    console.error(e);
    await finish("failed", { error: (e as Error).message });
  }
}
