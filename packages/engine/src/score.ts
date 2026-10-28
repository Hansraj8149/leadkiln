// Which offer a lead needs and how good a fit it is, from the words in the post and the workspace profile. Plain
// rules, so a score can always be explained: every point added lands in `why`.
import { JOB_SOURCES, phraseRegex, firstPhrase, type Fit, type Profile, type RawLead } from "@leadkiln/core";

/** Dropped for every workspace: unpaid work and people selling, not buying. */
const UNPAID =
  /\bunpaid\b|equity.only|for equity\b|no budget|free of charge|\bvolunteer\b|\$\s?[1-9](?![\d,.kKmM])\b|\binternship\b/i;
const SELLING =
  /\[for hire\]|seeking work|available for hire|\bi am an? (freelance |)(developer|designer|marketer)\b|hire me\b/i;
/** Ads their author has closed. */
const CLOSED = /\b(closed|filled|position has been filled|no longer (hiring|accepting))\b/i;
const PAID =
  /[$£€]\s?\d{2,}|\d{2,3}\s?(usd|eur|gbp|\/h|\/hr|per hour)|\bbudget\b|\bpaid\b|will pay|\bhourly\b|fixed.?price/i;

/**
 * Names a market might be written as in a post. Codes not listed still match the lead's country field. All-caps
 * words match only in capitals, so "us" in a sentence isn't the United States.
 */
const MARKET_WORDS: Record<string, string[]> = {
  US: ["US", "USA", "United States", "EST", "PST", "CST"],
  CA: ["Canada"],
  GB: ["UK", "United Kingdom", "London", "England"],
  AU: ["Australia"],
  NZ: ["New Zealand"],
  IE: ["Ireland"],
  DE: ["Germany", "Berlin"],
  NL: ["Netherlands", "Amsterdam"],
  FR: ["France", "Paris"],
  ES: ["Spain"],
  SE: ["Sweden"],
  NO: ["Norway"],
  DK: ["Denmark"],
  CH: ["Switzerland"],
  AE: ["UAE", "Dubai"],
  SG: ["Singapore"],
  IN: ["India"],
};

export function score(lead: RawLead, profile: Profile, now = Date.now()): Fit | null {
  const text = `${lead.title}\n${lead.body}`;
  if (SELLING.test(lead.title) || CLOSED.test(lead.title) || UNPAID.test(text)) return null;
  const banned = firstPhrase(text, profile.exclude);
  if (banned) return null;

  const hit = profile.offers.find((o) => phraseRegex(o.keywords)?.test(text));
  const stack = firstPhrase(text, profile.stack);
  const job = JOB_SOURCES.has(lead.source);
  // A job ad must name something you do.
  if (job && !hit && !stack) return null;

  const fallback =
    lead.source === "places"
      ? profile.sources.places.offer
      : lead.source === "hn-show"
        ? profile.sources.hnShow.offer
        : lead.source === "producthunt"
          ? profile.sources.producthunt.offer
          : undefined;
  const offer = hit ?? profile.offers.find((o) => o.id === fallback) ?? (job ? profile.offers[0] : undefined);
  if (!offer) return null;

  const why: string[] = [];
  let points = 30;
  const add = (n: number, reason: string) => {
    points += n;
    why.push(reason);
  };

  if (hit) add(15, `Asks for ${hit.label}`);
  if (job || /\[hiring\]/i.test(lead.title)) add(20, "Is hiring");
  if (PAID.test(text)) add(10, "Mentions a budget or rate");
  const market = profile.markets.find((code) => lead.country?.toUpperCase() === code || mentions(text, code));
  if (market) add(10, `In a market you want (${market})`);
  if (lead.contact) add(5, "Left a way to reach them");
  if (lead.siteUrl) add(5, "Has a site to look at");
  if (lead.postedAt) {
    const hours = (now - Date.parse(lead.postedAt)) / 3_600_000;
    if (hours < 24) add(10, "Posted in the last day");
    else if (hours > 24 * 10) add(-15, "But posted over ten days ago");
  }
  if (stack) add(5, `Names ${stack}`);

  return { offer: offer.id, score: Math.max(0, Math.min(100, points)), why };
}

function mentions(text: string, code: string) {
  const words = MARKET_WORDS[code] ?? [];
  const caps = words.filter((w) => w === w.toUpperCase());
  const names = words.filter((w) => w !== w.toUpperCase());
  return caps.some((w) => new RegExp(`(^|[^A-Za-z])${w}([^A-Za-z]|$)`).test(text)) || !!phraseRegex(names)?.test(text);
}
