// Where leads come from: public APIs and feeds only, each read the way its owner allows. Every source returns its
// raw posts and never throws; the run records what each found, or why it was skipped.
import type { Profile, SourceResult } from "@leadkiln/core";
import { productHunt, reddit, remoteOk } from "./boards";
import { hnHiring, hnShow } from "./hn";
import { places } from "./places";
import { rss } from "./rss";

export { parseFeed } from "./rss";
export { placeQueries } from "./places";
export { plain, USER_AGENT } from "./http";

/** Per-workspace credentials. Each one switches on one source. */
export interface SourceKeys {
  redditClientId?: string;
  redditClientSecret?: string;
  productHuntToken?: string;
  googlePlacesKey?: string;
}

export const KEY_NAMES = ["redditClientId", "redditClientSecret", "productHuntToken", "googlePlacesKey"] as const;

export interface Ctx {
  profile: Profile;
  keys: SourceKeys;
  fetch: typeof fetch;
  now: number;
}

/** Every enabled source, read in parallel. */
export function readSources(ctx: Ctx): Promise<SourceResult[]> {
  const s = ctx.profile.sources;
  const on = [
    s.hnHiring.enabled && hnHiring(ctx),
    s.hnShow.enabled && hnShow(ctx),
    s.remoteok.enabled && remoteOk(ctx),
    s.reddit.enabled && reddit(ctx),
    s.producthunt.enabled && productHunt(ctx),
    s.places.enabled && places(ctx),
    s.rss.enabled && rss(ctx),
  ].filter((p): p is Promise<SourceResult> => !!p);
  return Promise.all(on);
}
