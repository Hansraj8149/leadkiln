// Any RSS 2.0 or Atom feed. A small tag reader rather than a DOM parser, so it runs the same in Workers and Node.
import type { RawLead } from "@leadkiln/core";
import { DAY, firstEmail, firstSite, getText, plain, safely } from "./http";
import type { Ctx } from "./index";

const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]?.trim();

const atomLink = (xml: string) =>
  xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ??
  xml.match(/<link[^>]*href=["']([^"']+)/i)?.[1];

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  body: string;
  author?: string;
  date?: string;
}

export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]!);
  return blocks
    .map((b) => {
      const link = plain(tag(b, "link") ?? "") || atomLink(b) || "";
      const title = plain(tag(b, "title") ?? "");
      return {
        id: plain(tag(b, "guid") ?? tag(b, "id") ?? "") || link || title,
        title,
        link,
        body: plain(tag(b, "description") ?? tag(b, "content:encoded") ?? tag(b, "content") ?? tag(b, "summary") ?? ""),
        author: plain(tag(b, "dc:creator") ?? tag(b, "name") ?? tag(b, "author") ?? "") || undefined,
        date: tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date"),
      };
    })
    .filter((i) => i.id && i.title && /^https?:\/\//.test(i.link));
}

/** Items from the last week across every feed. A feed that fails is named in the error; the others still count. */
export const rss = (ctx: Ctx) =>
  safely("rss", async () => {
    const feeds = ctx.profile.sources.rss.feeds;
    if (!feeds.length) throw new Error("skipped: add a feed");
    const since = ctx.now - 7 * DAY;
    const failed: string[] = [];
    const out: RawLead[] = [];
    for (const feed of feeds) {
      try {
        for (const item of parseFeed(await getText(ctx.fetch, feed.url))) {
          const at = item.date ? Date.parse(item.date) : NaN;
          if (!Number.isNaN(at) && at < since) continue;
          out.push({
            source: "rss",
            // Feed ids are only unique per feed.
            sourceId: `${feed.url}#${item.id}`.slice(0, 500),
            url: item.link,
            title: `${feed.label}: ${item.title}`.slice(0, 300),
            body: item.body.slice(0, 2000),
            author: item.author,
            contact: firstEmail(item.body),
            siteUrl: firstSite(item.body),
            postedAt: Number.isNaN(at) ? undefined : new Date(at).toISOString(),
          });
        }
      } catch (e) {
        failed.push(`${feed.label}: ${(e as Error).message}`);
      }
    }
    if (failed.length === feeds.length) throw new Error(failed.join("; "));
    return out;
  });
