// One run: read every enabled source, drop what's already known, score, look at the best leads' homepages and draft
// a message for each. Storage belongs to the caller (the Worker's D1, or the CLI's files); nothing here contacts a
// lead.
import type { Fit, Lead, Profile, RawLead, Source } from "@leadkiln/core";
import type { TextModel } from "@leadkiln/llm";
import { readSources, type SourceKeys } from "@leadkiln/sources";
import { askModel, compose } from "./draft";
import { factLines, look } from "./look";
import { score } from "./score";

export interface RunInput {
  profile: Profile;
  keys: SourceKeys;
  model: TextModel | null;
  /** Returns which `${source}:${sourceId}` keys are already stored. */
  known: (keys: string[]) => Promise<Set<string>>;
  /** Most leads this run may keep (plan limits). Defaults to the profile's maxPerRun. */
  limit?: number;
  fetch?: typeof fetch;
  now?: number;
}

export interface SourceSummary {
  source: Source;
  found: number;
  kept: number;
  error?: string;
}

export interface RunOutput {
  leads: Lead[];
  sources: SourceSummary[];
}

export const leadKey = (l: Pick<RawLead, "source" | "sourceId">) => `${l.source}:${l.sourceId}`;

export async function findLeads(input: RunInput): Promise<RunOutput> {
  const fetchImpl = input.fetch ?? fetch;
  const now = input.now ?? Date.now();
  const { profile } = input;
  const results = await readSources({ profile, keys: input.keys, fetch: fetchImpl, now });

  const raw = results.flatMap((r) => r.leads);
  const known = await input.known(raw.map(leadKey));
  const seen = new Set<string>();
  const limit = Math.min(input.limit ?? profile.maxPerRun, profile.maxPerRun);
  const candidates = raw
    .filter((l) => {
      const k = leadKey(l);
      if (known.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((lead) => ({ lead, fit: score(lead, profile, now) }))
    .filter((c): c is { lead: RawLead; fit: Fit } => !!c.fit && c.fit.score >= profile.minScore)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);

  const leads: Lead[] = [];
  for (const { lead, fit } of candidates) {
    const facts = factLines(await look(lead.siteUrl, fetchImpl));
    if (lead.source === "places") {
      // A local business with a working, well-made site isn't a lead.
      if (lead.siteUrl && facts.length && facts.every((f) => f.startsWith("Built with"))) continue;
      if (lead.siteUrl && !facts.length) continue;
      if (!lead.siteUrl) {
        facts.unshift("No website listed on Google Maps");
        fit.score = Math.min(100, fit.score + 15);
        fit.why.push("No website at all");
      }
    }
    const parts = await askModel(input.model, profile, lead);
    leads.push({ ...lead, ...fit, facts, draft: compose(profile, lead, fit, facts, parts) });
  }

  const kept = new Map<string, number>();
  for (const l of leads) kept.set(l.source, (kept.get(l.source) ?? 0) + 1);
  return {
    leads,
    sources: results.map((r) => ({
      source: r.source,
      found: r.leads.length,
      kept: kept.get(r.source) ?? 0,
      error: r.error,
    })),
  };
}
