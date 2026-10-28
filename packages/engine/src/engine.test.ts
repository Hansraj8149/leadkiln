import { describe, expect, it } from "vitest";
import { profileSchema, type RawLead } from "@leadkiln/core";
import { FakeModel } from "@leadkiln/llm";
import { compose, askModel } from "./draft";
import { exampleProfile, placeholders } from "./example";
import { factLines, publicUrl } from "./look";
import { findLeads } from "./run";
import { score } from "./score";

const NOW = Date.UTC(2026, 9, 28, 12);

const profile = profileSchema.parse({
  name: "Acme Studio",
  website: "https://acme.dev",
  sender: "Sam",
  intro: "I'm an independent developer in Lisbon.",
  offers: [
    {
      id: "automation",
      label: "automation",
      keywords: ["n8n", "zapier", "automate"],
      link: "https://acme.dev/automation",
    },
    { id: "website", label: "a website", keywords: ["website", "landing page"] },
  ],
  proof: [
    {
      id: "crm",
      text: "I built a CRM sync that runs 40 workflows for a clinic.",
      about: "automation for a clinic",
      offers: ["automation"],
    },
    { id: "shop", text: "I built a bakery's online shop.", about: "a small business website", offers: ["website"] },
  ],
  stack: ["supabase"],
  markets: ["US", "GB"],
  exclude: ["onsite only"],
  sources: { hnHiring: { enabled: true }, places: { enabled: false, offer: "website" } },
});

const post = (over: Partial<RawLead> = {}): RawLead => ({
  source: "reddit",
  sourceId: "abc",
  url: "https://www.reddit.com/r/n8n/abc",
  title: "r/n8n: Need someone to automate our Zapier flows",
  body: "We're a US agency with a budget of $2,000. Zapier is too expensive.",
  author: "u/jordan_k",
  postedAt: new Date(NOW - 3_600_000).toISOString(),
  ...over,
});

describe("score", () => {
  it("explains every point", () => {
    const fit = score(post(), profile, NOW)!;
    expect(fit.offer).toBe("automation");
    expect(fit.why).toEqual([
      "Asks for automation",
      "Mentions a budget or rate",
      "In a market you want (US)",
      "Posted in the last day",
    ]);
    expect(fit.score).toBe(30 + 15 + 10 + 10 + 10);
  });

  it("drops unpaid work, sellers and excluded phrases", () => {
    expect(score(post({ body: "Equity only, sorry" }), profile, NOW)).toBeNull();
    expect(score(post({ title: "[For Hire] n8n developer" }), profile, NOW)).toBeNull();
    expect(score(post({ title: "Acme | n8n | CLOSED NOW" }), profile, NOW)).toBeNull();
    expect(score(post({ body: "n8n role, onsite only in Austin" }), profile, NOW)).toBeNull();
  });

  it("needs a job ad to name an offer or the stack", () => {
    expect(
      score(
        post({ source: "hn-hiring", title: "Acme | Firmware | CONTRACT", body: "Rust firmware contract" }),
        profile,
        NOW,
      ),
    ).toBeNull();
    expect(
      score(post({ source: "hn-hiring", title: "Acme | Contract", body: "Supabase work" }), profile, NOW)?.why,
    ).toContain("Is hiring");
  });

  it("uses the source's default offer for local businesses", () => {
    const fit = score(
      post({ source: "places", title: "Joe's Plumbing (plumber in Leeds)", body: "Rating 4.8", country: "GB" }),
      profile,
      NOW,
    );
    expect(fit?.offer).toBe("website");
    expect(fit?.why).toContain("In a market you want (GB)");
  });

  it("reads markets carefully", () => {
    const fit = score(post({ body: "Tell us what you think, budget $500" }), profile, NOW)!;
    expect(fit.why).not.toContain("In a market you want (US)");
    expect(score(post({ body: "Remote (UK), budget $500" }), profile, NOW)!.why).toContain("In a market you want (GB)");
  });

  it("greets by name only when the author looks like one", () => {
    const lead = post({ author: "Dana" });
    expect(compose(profile, lead, score(lead, profile, NOW)!, [], { need: "" })).toMatch(/^Hi Dana,/);
  });

  it("matches phrases as whole words", () => {
    expect(score(post({ title: "Unrelated", body: "the n8nx tool" }), profile, NOW)).toBeNull();
  });
});

describe("drafts", () => {
  it("says only the profile's claims, and the model's sentence about the lead", async () => {
    const model = new FakeModel(['{"need": "You want your Zapier flows moved somewhere cheaper", "proof": "crm"}']);
    const lead = post();
    const fit = score(lead, profile, NOW)!;
    const parts = await askModel(model, profile, lead);
    const text = compose(profile, lead, fit, ["Built with Webflow"], parts);
    expect(text).toBe(
      "Hi,\n\nYou want your Zapier flows moved somewhere cheaper. I had a quick look at your homepage: built with Webflow.\n\n" +
        "I'm an independent developer in Lisbon. I built a CRM sync that runs 40 workflows for a clinic. More here: https://acme.dev/automation\n\n" +
        "Would a 15-minute call this week help?\n\nSam",
    );
    expect(model.calls[0]!.system).toContain("crm = automation for a clinic");
  });

  it("refuses a sentence that makes claims, and an unknown proof", async () => {
    const parts = await askModel(
      new FakeModel(['{"need": "You need me, I have 10 years of experience", "proof": "nope"}']),
      profile,
      post(),
    );
    expect(parts).toEqual({ need: "", proof: undefined });
  });

  it("falls back to fixed text when the model fails", async () => {
    const lead = post();
    const parts = await askModel(new FakeModel([new Error("down")]), profile, lead);
    expect(compose(profile, lead, score(lead, profile, NOW)!, [], parts)).toContain(
      "I saw your post about automation.",
    );
  });
});

describe("look", () => {
  it("only fetches public addresses", () => {
    expect(publicUrl("http://localhost:3000")).toBeNull();
    expect(publicUrl("http://10.0.0.1")).toBeNull();
    expect(publicUrl("https://printer.local")).toBeNull();
    expect(publicUrl("acme.dev")?.href).toBe("https://acme.dev/");
  });

  it("describes only what it saw", () => {
    expect(factLines({ reached: false, status: 500 })).toEqual(["Homepage answered with an error (500)"]);
    expect(
      factLines({ reached: true, https: true, title: "A", description: true, viewport: true, words: 300 }),
    ).toEqual([]);
  });
});

describe("example profile", () => {
  it("is valid and flags its placeholders", () => {
    expect(placeholders(exampleProfile).length).toBeGreaterThan(0);
    expect(placeholders(profile)).toEqual([]);
  });
});

describe("findLeads", () => {
  it("reads sources, skips known posts, drafts the best", async () => {
    const thread = {
      hits: [
        { objectID: "100", title: "Ask HN: Who is hiring? (October 2026)", author: "whoishiring", created_at: "" },
      ],
    };
    const comments = {
      hits: [
        {
          objectID: "1",
          parent_id: 100,
          author: "pat",
          created_at: new Date(NOW - 3_600_000).toISOString(),
          comment_text: "Acme | Automation engineer | REMOTE (US) | CONTRACT<p>We use n8n and pay $90/hr. hi@acme.co",
        },
        {
          objectID: "2",
          parent_id: 100,
          author: "lee",
          created_at: new Date(NOW).toISOString(),
          comment_text: "Beta | Zapier help | CONTRACT<p>More zapier",
        },
        {
          objectID: "3",
          parent_id: 100,
          author: "kim",
          created_at: "",
          comment_text: "Gamma | Staff engineer | FULL TIME",
        },
      ],
    };
    const fakeFetch = (async (url: string) => {
      const body = String(url).includes("author_whoishiring") ? thread : comments;
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const out = await findLeads({
      profile,
      keys: {},
      model: null,
      known: async (keys) => new Set(keys.filter((k) => k === "hn-hiring:2")),
      fetch: fakeFetch,
      now: NOW,
    });
    expect(out.sources).toEqual([{ source: "hn-hiring", found: 2, kept: 1, error: undefined }]);
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0]).toMatchObject({ sourceId: "1", offer: "automation", contact: "hi@acme.co" });
    expect(out.leads[0]!.draft).toContain("I'd like to apply for the role in your post (Acme · Automation engineer)");
  });
});
