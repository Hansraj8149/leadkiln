// What a source returns, and what a run makes of it.

export const SOURCES = ["hn-hiring", "hn-show", "remoteok", "reddit", "producthunt", "places", "rss"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  "hn-hiring": "Hacker News: Who is hiring?",
  "hn-show": "Hacker News: Show HN",
  remoteok: "RemoteOK",
  reddit: "Reddit",
  producthunt: "Product Hunt",
  places: "Google Maps",
  rss: "RSS feeds",
};

/** Sources whose posts are job ads, written by a company hiring. */
export const JOB_SOURCES: ReadonlySet<Source> = new Set(["hn-hiring", "remoteok"]);

export interface RawLead {
  source: Source;
  /** The source's own id, so a rerun never adds the same post twice. */
  sourceId: string;
  /** The post, launch or map listing. Every lead keeps it, which some sources' terms require. */
  url: string;
  title: string;
  body: string;
  author?: string;
  siteUrl?: string;
  country?: string;
  /** Only something the lead published themselves: an email in their post, a business phone on its listing. */
  contact?: string;
  postedAt?: string;
}

export interface SourceResult {
  source: Source;
  leads: RawLead[];
  /** Why nothing came back: "skipped: …" for a missing key, or the error. */
  error?: string;
}

export interface Fit {
  offer: string;
  score: number;
  /** Every point added or taken away, in plain words, so a score can always be explained. */
  why: string[];
}

export interface Lead extends RawLead, Fit {
  /** What one public GET of their homepage showed. */
  facts: string[];
  draft: string;
}

export const STATUSES = ["new", "sent", "replied", "won", "skipped"] as const;
export type LeadStatus = (typeof STATUSES)[number];
