import { describe, expect, it } from "vitest";
import { phraseRegex, profileSchema } from "@leadkiln/core";
import { parseFeed, placeQueries, readSources } from "./index";

describe("parseFeed", () => {
  it("reads RSS items", () => {
    const xml = `<rss><channel><item><title><![CDATA[Need a Shopify dev]]></title><link>https://board.example/1</link>
      <guid>job-1</guid><description>&lt;p&gt;Budget $3k&lt;/p&gt;</description><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseFeed(xml)).toEqual([
      {
        id: "job-1",
        title: "Need a Shopify dev",
        link: "https://board.example/1",
        body: "Budget $3k",
        author: undefined,
        date: "Tue, 27 Oct 2026 10:00:00 GMT",
      },
    ]);
  });

  it("reads Atom entries", () => {
    const xml = `<feed><entry><id>tag:x,1</id><title>Hiring a designer</title><link rel="alternate" href="https://x.example/a"/>
      <updated>2026-10-27T10:00:00Z</updated><author><name>Ann</name></author><summary>Logo work</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({
      id: "tag:x,1",
      link: "https://x.example/a",
      author: "Ann",
      body: "Logo work",
    });
  });
});

describe("placeQueries", () => {
  it("rotates through every trade and city", () => {
    const trades = ["dentist", "plumber"];
    const cities = [
      { name: "Leeds", country: "GB" },
      { name: "Perth", country: "AU" },
      { name: "Austin", country: "US" },
    ];
    const day = 86_400_000;
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) placeQueries(trades, cities, 2, d * day).forEach((q) => seen.add(q.text));
    expect(seen.size).toBe(6);
    expect(placeQueries(trades, cities, 50, 0)).toHaveLength(6);
  });
});

describe("phraseRegex", () => {
  it("escapes and matches whole words", () => {
    const re = phraseRegex(["make.com", "next.js", "c++"])!;
    expect(re.test("we use Make.com")).toBe(true);
    expect(re.test("makexcom")).toBe(false);
    expect(re.test("Next.js app")).toBe(true);
    expect(re.test("C++ engineer")).toBe(true);
  });
});

describe("readSources", () => {
  it("records a skipped source instead of failing", async () => {
    const profile = profileSchema.parse({
      name: "A",
      website: "https://a.example",
      sender: "A",
      intro: "I build websites for shops.",
      offers: [{ id: "web", label: "a website", keywords: ["website"] }],
      sources: { reddit: { enabled: true, subreddits: ["forhire"] }, rss: { enabled: true, feeds: [] } },
    });
    const out = await readSources({ profile, keys: {}, fetch: fetch, now: 0 });
    expect(out).toEqual([
      { source: "reddit", leads: [], error: "skipped: no Reddit app id and secret" },
      { source: "rss", leads: [], error: "skipped: add a feed" },
    ]);
  });
});
