import { profileSchema, type LeadStatus, type Profile } from "@leadkiln/core";
import { KEY_NAMES, type SourceKeys } from "@leadkiln/sources";
import { decrypt } from "./crypto";
import type { Env } from "./env";

export const one = <T>(db: D1Database, sql: string, ...args: unknown[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .first<T>();

export const all = async <T>(db: D1Database, sql: string, ...args: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;

export const exec = (db: D1Database, sql: string, ...args: unknown[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .run();

export interface AccountRow {
  id: string;
  plan: string;
  plan_status: string;
  ls_customer_id: string | null;
  ls_subscription_id: string | null;
}

export interface WorkspaceRow {
  id: string;
  account_id: string;
  profile: string;
  paused: number;
  run_hour: number;
  next_run_at: number | null;
  digest_email: string | null;
  webhook_url: string | null;
  created_at: number;
}

export interface LeadRow {
  id: string;
  workspace_id: string;
  source: string;
  source_id: string;
  url: string;
  title: string;
  body: string;
  author: string | null;
  contact: string | null;
  site_url: string | null;
  country: string | null;
  offer: string;
  score: number;
  why: string;
  facts: string;
  draft: string;
  note: string;
  status: LeadStatus;
  posted_at: string | null;
  found_at: number;
  updated_at: number;
}

export interface RunRow {
  id: string;
  workspace_id: string;
  status: "queued" | "running" | "done" | "failed";
  trigger: "schedule" | "manual";
  model: string | null;
  added: number;
  sources: string;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

export const parseProfile = (row: WorkspaceRow): Profile => profileSchema.parse(JSON.parse(row.profile));

export async function workspaceKeys(env: Env, workspaceId: string): Promise<SourceKeys> {
  const rows = await all<{ name: string; value_enc: string }>(
    env.DB,
    "SELECT name, value_enc FROM workspace_keys WHERE workspace_id = ?",
    workspaceId,
  );
  const keys: SourceKeys = {};
  for (const r of rows)
    if ((KEY_NAMES as readonly string[]).includes(r.name))
      keys[r.name as keyof SourceKeys] = await decrypt(env.LEADKILN_ENCRYPTION_KEY, r.value_enc);
  return keys;
}

/** The next time the daily run is due: today at run_hour UTC if that's still ahead, else tomorrow. */
export function nextRunAt(runHour: number, now = Date.now()): number {
  const d = new Date(now);
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), runHour);
  return at > now ? at : at + 86_400_000;
}

export const leadView = (l: LeadRow) => ({
  id: l.id,
  workspaceId: l.workspace_id,
  source: l.source,
  url: l.url,
  title: l.title,
  body: l.body,
  author: l.author,
  contact: l.contact,
  siteUrl: l.site_url,
  country: l.country,
  offer: l.offer,
  score: l.score,
  why: JSON.parse(l.why) as string[],
  facts: JSON.parse(l.facts) as string[],
  draft: l.draft,
  note: l.note,
  status: l.status,
  postedAt: l.posted_at,
  foundAt: l.found_at,
  updatedAt: l.updated_at,
});

export const runView = (r: RunRow) => ({
  id: r.id,
  status: r.status,
  trigger: r.trigger,
  model: r.model,
  added: r.added,
  sources: JSON.parse(r.sources),
  error: r.error,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});
