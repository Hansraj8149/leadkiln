// Hacker News through the Algolia API, which needs no key.
import { phraseRegex } from "@leadkiln/core";
import { DAY, getJson, firstEmail, firstSite, plain, safely } from "./http";
import type { Ctx } from "./index";

interface HnHit {
  objectID: string;
  title?: string;
  url?: string;
  story_text?: string;
  comment_text?: string;
  author: string;
  created_at: string;
  parent_id?: number;
}

const API = "https://hn.algolia.com/api/v1";

/**
 * Contract and freelance posts in the latest monthly "Ask HN: Who is hiring?" thread. Top-level comments only; by
 * the thread's convention each starts "Company | Role | Location | REMOTE | CONTRACT".
 */
export const hnHiring = (ctx: Ctx) =>
  safely("hn-hiring", async () => {
    const threads = await getJson<{ hits: HnHit[] }>(
      ctx.fetch,
      `${API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=6`,
    );
    const thread = threads.hits.find((h) => /who is hiring/i.test(h.title ?? ""));
    if (!thread) return [];
    const since = Math.floor((ctx.now - 35 * DAY) / 1000);
    const { hits } = await getJson<{ hits: HnHit[] }>(
      ctx.fetch,
      `${API}/search_by_date?tags=comment,story_${thread.objectID}&numericFilters=created_at_i>${since}&hitsPerPage=1000`,
    );
    return hits
      .filter((h) => String(h.parent_id) === thread.objectID)
      .map((h) => ({ h, body: plain(h.comment_text ?? "") }))
      .filter(({ body }) =>
        /\b(contract|contractor|freelance|part.?time|fractional)\b/i.test(body.split("\n")[0] ?? ""),
      )
      .map(({ h, body }) => ({
        source: "hn-hiring" as const,
        sourceId: h.objectID,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: (body.split("\n")[0] ?? "").slice(0, 160),
        body: body.slice(0, 2000),
        author: h.author,
        contact: firstEmail(body),
        siteUrl: firstSite(body),
        postedAt: h.created_at,
      }));
  });

/** Show HN launches from the last week whose title, text or link matches one of the profile's phrases. */
export const hnShow = (ctx: Ctx) =>
  safely("hn-show", async () => {
    const match = phraseRegex(ctx.profile.sources.hnShow.match);
    if (!match) throw new Error("skipped: add phrases to look for");
    const since = Math.floor((ctx.now - 7 * DAY) / 1000);
    const { hits } = await getJson<{ hits: HnHit[] }>(
      ctx.fetch,
      `${API}/search_by_date?tags=show_hn&numericFilters=created_at_i>${since}&hitsPerPage=500`,
    );
    return hits
      .filter((h) => match.test(`${h.title} ${h.story_text ?? ""} ${h.url ?? ""}`) && !/github\.com/i.test(h.url ?? ""))
      .map((h) => ({
        source: "hn-show" as const,
        sourceId: h.objectID,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.title ?? "",
        body: plain(h.story_text ?? ""),
        author: h.author,
        siteUrl: h.url,
        postedAt: h.created_at,
      }));
  });
