// Local businesses from Google Places (New). The website check happens later, in the engine's look step.
import type { RawLead } from "@leadkiln/core";
import { DAY, getJson, safely } from "./http";
import type { Ctx } from "./index";

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "businessStatus",
].map((f) => `places.${f}`);

/** The trade × city searches for a given day, rotating so the same ones aren't asked every day. */
export function placeQueries(
  trades: readonly string[],
  cities: readonly { name: string; country: string }[],
  perRun: number,
  now: number,
) {
  if (!trades.length || !cities.length) return [];
  const day = Math.floor(now / DAY);
  const total = trades.length * cities.length;
  return Array.from({ length: Math.min(perRun, total) }, (_, i) => {
    const n = (day * perRun + i) % total;
    const city = cities[n % cities.length]!;
    return { text: `${trades[Math.floor(n / cities.length)]} in ${city.name}`, country: city.country };
  });
}

export const places = (ctx: Ctx) =>
  safely("places", async () => {
    const cfg = ctx.profile.sources.places;
    const queries = placeQueries(cfg.trades, cfg.cities, cfg.perRun, ctx.now);
    if (!queries.length) throw new Error("skipped: add trades and cities");
    if (!ctx.keys.googlePlacesKey) throw new Error("skipped: no Google Places key");
    const out: RawLead[] = [];
    for (const q of queries) {
      const res = await getJson<{ places?: Place[] }>(ctx.fetch, "https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": ctx.keys.googlePlacesKey,
          "x-goog-fieldmask": FIELDS.join(","),
        },
        body: JSON.stringify({ textQuery: q.text, pageSize: 20 }),
      });
      for (const p of res.places ?? []) {
        if (p.businessStatus !== "OPERATIONAL" || (p.userRatingCount ?? 0) < cfg.minReviews) continue;
        out.push({
          source: "places",
          sourceId: p.id,
          url: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
          title: `${p.displayName?.text ?? "Business"} (${q.text})`,
          body: `${p.formattedAddress ?? ""}\nRating ${p.rating ?? "?"} from ${p.userRatingCount ?? 0} reviews.`,
          siteUrl: p.websiteUri,
          contact: p.nationalPhoneNumber,
          country: q.country,
        });
      }
    }
    return out;
  });
