import { profileSchema, type Profile } from "@leadkiln/core";

/**
 * The profile a new workspace starts from: a small web studio. Every bracketed sentence is a placeholder the owner
 * must replace with their own words; a run refuses to start while any are left (see `placeholders`).
 */
export const exampleProfile: Profile = profileSchema.parse({
  name: "Your studio",
  website: "https://example.com",
  sender: "Sam",
  intro: "[Who you are in one sentence, e.g. I'm an independent developer who builds web apps for small teams.]",
  offers: [
    {
      id: "website",
      label: "a website",
      keywords: ["website", "landing page", "web site", "redesign", "wordpress", "webflow", "shopify"],
    },
    {
      id: "automation",
      label: "automation",
      keywords: ["automation", "automate", "zapier", "n8n", "make.com", "airtable", "crm integration"],
    },
    { id: "app", label: "a web or mobile app", keywords: ["mvp", "web app", "mobile app", "saas", "prototype"] },
  ],
  proof: [
    {
      id: "best-work",
      text: "[A project you shipped, as you'd say it: I built X for Y, live since 2025.]",
      about: "[what that project shows, in a few words]",
      offers: ["website", "app"],
    },
  ],
  stack: ["react", "next.js", "node", "supabase"],
  markets: ["US", "CA", "GB", "AU"],
  exclude: ["onsite only", "full-time only", "W-2 only", "security clearance"],
  sources: {
    hnHiring: { enabled: true },
    remoteok: { enabled: true },
    hnShow: { enabled: false, match: ["lovable.app", "bolt.new", "non-technical"] },
    reddit: { enabled: false, subreddits: ["forhire", "smallbusiness", "Entrepreneur"] },
  },
});

/** Placeholder text left in a profile, which would end up in a message. */
export const placeholders = (p: Profile) =>
  [p.intro, ...p.proof.flatMap((x) => [x.text, x.about])].filter((s) => /\[[^\]]+\]/.test(s));
