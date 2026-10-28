// A workspace profile: who is selling, what they sell, the claims a message may make about them, and where to look.
// Everything a run does is driven by this, so one install serves a dev studio, an agency or a local trade alike.
import { z } from "zod";

const phrase = z.string().trim().min(2).max(80);
const phrases = z.array(phrase).max(60).default([]);

export const offerSchema = z.object({
  /** Short stable id, e.g. "automation". */
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,32}$/, "Use lowercase letters, digits and dashes."),
  /** How a message names it: "automation", "a website", "fixing an AI-built app". */
  label: z.string().trim().min(2).max(60),
  /** Words or phrases that show a post asks for this. Matched as whole words, any case. */
  keywords: z.array(phrase).min(1).max(60),
  /** Your page about it, linked in the message. Defaults to the profile's website. */
  link: z.url().optional(),
});

export const proofSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,32}$/, "Use lowercase letters, digits and dashes."),
  /** A sentence you can stand behind, written as you'd say it: "I built X, live on the App Store." */
  text: z.string().trim().min(10).max(300),
  /** What it shows, in a few words, so the model can pick the most relevant one. Never sent to a lead. */
  about: z.string().trim().min(3).max(160),
  /** Which offers it fits when the model is unavailable. */
  offers: z.array(z.string()).default([]),
});

const toggle = { enabled: z.boolean().default(false) };

export const sourcesSchema = z.object({
  /** Contract and freelance posts in Hacker News' monthly "Who is hiring?" thread. */
  hnHiring: z.object({ ...toggle }).default({ enabled: false }),
  /** Show HN launches whose text or link matches one of these phrases, e.g. "lovable.app", "non-technical". */
  hnShow: z.object({ ...toggle, match: phrases, offer: z.string().optional() }).default({ enabled: false, match: [] }),
  /** RemoteOK contract and part-time roles that name one of your offer keywords or stack. */
  remoteok: z.object({ ...toggle }).default({ enabled: false }),
  /** New posts in these subreddits asking for help or someone to hire. Needs a Reddit app id and secret. */
  reddit: z
    .object({
      ...toggle,
      subreddits: z
        .array(z.string().regex(/^[A-Za-z0-9_]{2,21}$/))
        .max(30)
        .default([]),
    })
    .default({ enabled: false, subreddits: [] }),
  /** Product Hunt launches from the last two days that match one of these phrases. Needs a developer token. */
  producthunt: z
    .object({ ...toggle, match: phrases, offer: z.string().optional() })
    .default({ enabled: false, match: [] }),
  /** Local businesses on Google Maps with no website or a weak one. Needs a Places API key. */
  places: z
    .object({
      ...toggle,
      trades: phrases,
      cities: z
        .array(z.object({ name: phrase, country: z.string().regex(/^[A-Z]{2}$/) }))
        .max(60)
        .default([]),
      /** Searches per run; each is one trade in one city, rotating through the lists day by day. */
      perRun: z.number().int().min(1).max(20).default(5),
      /** Businesses with fewer reviews than this are skipped (new or closed). */
      minReviews: z.number().int().min(0).max(1000).default(15),
      offer: z.string().optional(),
    })
    .default({ enabled: false, trades: [], cities: [], perRun: 5, minReviews: 15 }),
  /** Any RSS or Atom feed: a job board, a forum's "help wanted" tag, a saved search. */
  rss: z
    .object({
      ...toggle,
      feeds: z
        .array(z.object({ url: z.url(), label: phrase }))
        .max(20)
        .default([]),
    })
    .default({ enabled: false, feeds: [] }),
});

export const profileSchema = z.object({
  /** The business, as leads will see it in the message's link. */
  name: z.string().trim().min(1).max(80),
  website: z.url(),
  /** Your first name for the message sign-off. */
  sender: z.string().trim().min(1).max(60),
  /** Who you are in one or two sentences, written as you'd say it. Opens the second paragraph of every message. */
  intro: z.string().trim().min(10).max(400),
  offers: z.array(offerSchema).min(1).max(20),
  proof: z.array(proofSchema).max(20).default([]),
  /** Tools you work with. A post naming one scores higher; a job post must name one of these or an offer keyword. */
  stack: phrases,
  /** Countries you want clients in (ISO codes such as US, GB, DE). A post that mentions one scores higher. */
  markets: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(60)
    .default([]),
  /** A post containing any of these is dropped: "unpaid", "equity only", "onsite"… */
  exclude: phrases,
  /** Closing line for posts and launches. */
  ask: z.string().trim().max(300).default("Would a 15-minute call this week help?"),
  /** Closing line for job posts. */
  jobAsk: z.string().trim().max(300).default("What would you like to see from me first?"),
  /** Leads scoring below this are not saved. */
  minScore: z.number().int().min(0).max(100).default(50),
  /** Homepage looks and drafts per run, best first. */
  maxPerRun: z.number().int().min(1).max(50).default(15),
  sources: sourcesSchema.default(sourcesSchema.parse({})),
});

export type Offer = z.infer<typeof offerSchema>;
export type Proof = z.infer<typeof proofSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
export type SourcesConfig = z.infer<typeof sourcesSchema>;
