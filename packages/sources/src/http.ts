import { PRODUCT, type RawLead, type Source, type SourceResult } from "@leadkiln/core";

export const DAY = 86_400_000;
export const USER_AGENT = `${PRODUCT.name} lead finder (+${PRODUCT.url})`;

export async function getJson<T>(fetchImpl: typeof fetch, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchImpl(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return (await res.json()) as T;
}

export async function getText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const res = await fetchImpl(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return (await res.text()).slice(0, 2_000_000);
}

/** HTML from post bodies to plain text. */
export function plain(html: string) {
  // Entities first, so feeds that escape their HTML lose the tags too.
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const firstEmail = (text: string) => text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i)?.[0];

/** The first link in a post that isn't the forum itself. */
export const firstSite = (text: string) =>
  text.match(/https?:\/\/(?![^\s]*(?:news\.ycombinator|reddit\.com|producthunt\.com))[^\s<>()"']+/)?.[0];

/** Runs a source and turns any failure into a recorded error, so one broken source never stops a run. */
export async function safely(source: Source, fn: () => Promise<RawLead[]>): Promise<SourceResult> {
  try {
    return { source, leads: await fn() };
  } catch (e) {
    return { source, leads: [], error: e instanceof Error ? e.message : String(e) };
  }
}
