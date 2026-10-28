// Job boards and launch sites: RemoteOK, Reddit, Product Hunt.
import { phraseRegex } from "@leadkiln/core";
import { DAY, firstSite, getJson, plain, safely } from "./http";
import type { Ctx } from "./index";

const CONTRACT = /\b(contract|contractor|freelance|freelancer|part.?time)\b/i;

interface RemoteOkJob {
  id?: string;
  slug?: string;
  position?: string;
  company?: string;
  description?: string;
  tags?: string[];
  location?: string;
  url?: string;
  date?: string;
}

/** Contract roles from the last three days that name an offer keyword or the stack. RemoteOK asks for a link back. */
export const remoteOk = (ctx: Ctx) =>
  safely("remoteok", async () => {
    const fits = phraseRegex([...ctx.profile.offers.flatMap((o) => o.keywords), ...ctx.profile.stack]);
    if (!fits) return [];
    const jobs = await getJson<RemoteOkJob[]>(ctx.fetch, "https://remoteok.com/api");
    const since = ctx.now - 3 * DAY;
    return jobs
      .filter((j) => j.id && j.position && (!j.date || Date.parse(j.date) > since))
      .filter((j) => {
        const head = `${j.position} ${(j.tags ?? []).join(" ")}`;
        return CONTRACT.test(head) && fits.test(`${head} ${j.description ?? ""}`);
      })
      .map((j) => ({
        source: "remoteok" as const,
        sourceId: String(j.id),
        url: j.url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id}`,
        title: `${j.position}${j.company ? ` at ${j.company}` : ""}`,
        body: plain(j.description ?? "").slice(0, 2000),
        author: j.company,
        country: j.location,
        postedAt: j.date,
      }));
  });

/** Posts asking for help, someone to hire, or offering to pay. In r/forhire only "[Hiring]" posts. */
const ASKING =
  /\b(hire|hiring|looking for (a |an )?(dev|developer|freelancer|someone|help|agency|expert|designer|consultant)|need (a |an )?(dev|developer|help|someone|website|designer)|anyone (who )?can (help|build|fix|make)|paid|budget|will pay|recommend (a|an|someone))\b/i;

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    permalink: string;
    subreddit: string;
    created_utc: number;
    link_flair_text?: string | null;
  };
}

/** App-only OAuth: Reddit refuses keyless requests from most cloud hosts. */
export const reddit = (ctx: Ctx) =>
  safely("reddit", async () => {
    const subs = ctx.profile.sources.reddit.subreddits;
    if (!subs.length) throw new Error("skipped: add subreddits");
    if (!ctx.keys.redditClientId || !ctx.keys.redditClientSecret)
      throw new Error("skipped: no Reddit app id and secret");
    const token = await getJson<{ access_token: string }>(ctx.fetch, "https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${ctx.keys.redditClientId}:${ctx.keys.redditClientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const listing = await getJson<{ data: { children: RedditPost[] } }>(
      ctx.fetch,
      `https://oauth.reddit.com/r/${subs.join("+")}/new?limit=100&raw_json=1`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    const since = (ctx.now - 2 * DAY) / 1000;
    return listing.data.children
      .map((c) => c.data)
      .filter((p) => p.created_utc > since)
      .filter((p) =>
        p.subreddit.toLowerCase() === "forhire"
          ? /\[hiring\]/i.test(p.title) || /hiring/i.test(p.link_flair_text ?? "")
          : ASKING.test(`${p.title} ${p.selftext}`),
      )
      .map((p) => ({
        source: "reddit" as const,
        sourceId: p.id,
        url: `https://www.reddit.com${p.permalink}`,
        title: `r/${p.subreddit}: ${p.title}`,
        body: p.selftext.slice(0, 2000),
        author: `u/${p.author}`,
        siteUrl: firstSite(p.selftext),
        postedAt: new Date(p.created_utc * 1000).toISOString(),
      }));
  });

interface PhPost {
  id: string;
  name: string;
  tagline: string;
  description?: string;
  url: string;
  website?: string;
  createdAt: string;
  makers?: { username: string }[];
}

/** Launches from the last two days matching one of the profile's phrases. */
export const productHunt = (ctx: Ctx) =>
  safely("producthunt", async () => {
    const match = phraseRegex(ctx.profile.sources.producthunt.match);
    if (!match) throw new Error("skipped: add phrases to look for");
    if (!ctx.keys.productHuntToken) throw new Error("skipped: no Product Hunt token");
    const after = new Date(ctx.now - 2 * DAY).toISOString();
    const res = await getJson<{ data?: { posts: { edges: { node: PhPost }[] } }; errors?: { message: string }[] }>(
      ctx.fetch,
      "https://api.producthunt.com/v2/api/graphql",
      {
        method: "POST",
        headers: { authorization: `Bearer ${ctx.keys.productHuntToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          query: `{ posts(first: 50, postedAfter: "${after}", order: NEWEST) { edges { node { id name tagline description url website createdAt makers { username } } } } }`,
        }),
      },
    );
    if (res.errors?.length) throw new Error(res.errors[0]!.message);
    return (res.data?.posts.edges ?? [])
      .map((e) => e.node)
      .filter((p) => match.test(`${p.name} ${p.tagline} ${p.description ?? ""} ${p.website ?? ""}`))
      .map((p) => ({
        source: "producthunt" as const,
        sourceId: p.id,
        url: p.url,
        title: `${p.name}: ${p.tagline}`,
        body: p.description ?? "",
        author: p.makers?.[0] ? `@${p.makers[0].username}` : undefined,
        siteUrl: p.website,
        postedAt: p.createdAt,
      }));
  });
