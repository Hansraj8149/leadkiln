import type { LeadStatus, Profile, Source } from "@leadkiln/core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status}).`);
  return json as T;
}

export interface Plan {
  id: string;
  name: string;
  leadsPerMonth: number;
  workspaces: number;
}

export interface Me {
  email: string;
  plan: Plan;
  planStatus: string;
  plans: Plan[];
  hasSubscription: boolean;
  usage: { month: string; leads: number };
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  paused: boolean;
  nextRunAt: number | null;
  newLeads: number;
}

export type KeyName = "redditClientId" | "redditClientSecret" | "productHuntToken" | "googlePlacesKey";

export interface Workspace {
  id: string;
  profile: Profile;
  placeholders: string[];
  paused: boolean;
  runHour: number;
  nextRunAt: number | null;
  digestEmail: string | null;
  webhookUrl: string | null;
  keys: Record<KeyName, boolean>;
}

export interface Lead {
  id: string;
  workspaceId: string;
  source: Source;
  url: string;
  title: string;
  body: string;
  author: string | null;
  contact: string | null;
  siteUrl: string | null;
  country: string | null;
  offer: string;
  score: number;
  why: string[];
  facts: string[];
  draft: string;
  note: string;
  status: LeadStatus;
  postedAt: string | null;
  foundAt: number;
  updatedAt: number;
}

export interface Run {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  trigger: "schedule" | "manual";
  model: string | null;
  added: number;
  sources: { source: Source; found: number; kept: number; error?: string }[];
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export function ago(iso: string | number | null) {
  if (!iso) return "";
  const ms = Date.now() - (typeof iso === "number" ? iso : Date.parse(iso));
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
