#!/usr/bin/env -S npx tsx
// Self-hosted runs: the profile in a JSON file, keys in .env, leads written to out/ as Markdown and JSON. A file of
// seen post ids keeps a lead from coming back on the next run. Nothing is sent to anyone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { PRODUCT, profileSchema, SOURCE_LABELS, type Lead, type Profile } from "@leadkiln/core";
import { exampleProfile, findLeads, leadKey, placeholders } from "@leadkiln/engine";
import { AnthropicModel, WorkersAiRest, type TextModel } from "@leadkiln/llm";
import { readSources, type SourceKeys } from "@leadkiln/sources";

const HELP = `${PRODUCT.name}: people asking for what you sell, with a first message ready.

Usage
  pnpm leadkiln init                 write leadkiln.config.json to fill in
  pnpm leadkiln sources              check every enabled source without saving anything
  pnpm leadkiln run [--dry-run]      find, score and draft; write out/leads-<date>.md and .json

Options
  --config    Path to the profile (default: leadkiln.config.json)
  --out       Output folder (default: out)
  --dry-run   Print the leads; don't write files or remember them

Environment (.env): ANTHROPIC_API_KEY (or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN) for the one-sentence summary;
REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, PRODUCTHUNT_TOKEN, GOOGLE_PLACES_KEY for the sources that need them.`;

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", default: "leadkiln.config.json" },
    out: { type: "string", default: "out" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (existsSync(".env")) process.loadEnvFile(".env");
const env = process.env;

function loadProfile(): Profile {
  if (!existsSync(values.config!)) fail(`No ${values.config}. Run \`pnpm leadkiln init\` first.`);
  const parsed = profileSchema.safeParse(JSON.parse(readFileSync(values.config!, "utf8")));
  if (!parsed.success)
    fail(
      `${values.config} has problems:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  return parsed.data!;
}

const keys: SourceKeys = {
  redditClientId: env.REDDIT_CLIENT_ID,
  redditClientSecret: env.REDDIT_CLIENT_SECRET,
  productHuntToken: env.PRODUCTHUNT_TOKEN,
  googlePlacesKey: env.GOOGLE_PLACES_KEY,
};

function model(): TextModel | null {
  if (env.ANTHROPIC_API_KEY) return new AnthropicModel(env.ANTHROPIC_API_KEY, env.LEADKILN_MODEL || "claude-opus-5-5");
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN)
    return new WorkersAiRest(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, env.LEADKILN_MODEL || undefined);
  return null;
}

function markdown(profile: Profile, leads: Lead[], day: string) {
  const offer = (id: string) => profile.offers.find((o) => o.id === id)?.label ?? id;
  return [
    `# ${leads.length} new leads for ${profile.name}, ${day}`,
    "",
    "Nothing has been sent. Edit each draft and send it yourself.",
    ...leads.flatMap((l) => [
      "",
      `## ${l.score} · ${l.title}`,
      "",
      `${SOURCE_LABELS[l.source]} · ${offer(l.offer)} · ${l.url}`,
      "",
      `Why: ${l.why.join(", ")}`,
      ...(l.facts.length ? [`Their site: ${l.facts.join("; ")}`] : []),
      ...(l.contact ? [`Contact: ${l.contact}`] : []),
      "",
      ...l.draft.split("\n").map((line) => `> ${line}`),
    ]),
    "",
  ].join("\n");
}

async function main() {
  const cmd = positionals[0];
  if (values.help || !cmd) return console.log(HELP);

  if (cmd === "init") {
    if (existsSync(values.config!)) fail(`${values.config} already exists.`);
    writeFileSync(values.config!, `${JSON.stringify(exampleProfile, null, 2)}\n`);
    return console.log(
      `✓ Wrote ${values.config}. Replace every [bracketed] sentence, then run \`pnpm leadkiln sources\`.`,
    );
  }

  const profile = loadProfile();

  if (cmd === "sources") {
    const results = await readSources({ profile, keys, fetch, now: Date.now() });
    if (!results.length) fail("No source is enabled in the profile.");
    for (const r of results)
      console.log(
        `${r.error ? (r.error.startsWith("skipped") ? "–" : "✗") : "✓"} ${SOURCE_LABELS[r.source]}: ${r.error ?? `${r.leads.length} posts`}`,
      );
    return;
  }

  if (cmd === "run") {
    const left = placeholders(profile);
    if (left.length) fail(`Replace the [placeholder] text in ${values.config} first:\n  ${left.join("\n  ")}`);
    const seenFile = path.join(values.out!, "seen.json");
    const seen = new Set<string>(existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, "utf8")) : []);
    const m = model();
    console.log(`Searching${m ? ` (summaries by ${m.name})` : " (no model set: drafts use fixed text)"}…`);
    const out = await findLeads({
      profile,
      keys,
      model: m,
      known: async (ks) => new Set(ks.filter((k) => seen.has(k))),
    });
    for (const s of out.sources)
      console.log(`  ${SOURCE_LABELS[s.source]}: ${s.error ?? `${s.found} found, ${s.kept} kept`}`);
    const day = new Date().toISOString().slice(0, 10);
    if (values["dry-run"]) return console.log(`\n${markdown(profile, out.leads, day)}`);
    if (!out.leads.length) return console.log("\nNo new leads this time.");
    mkdirSync(values.out!, { recursive: true });
    const base = path.join(values.out!, `leads-${day}`);
    writeFileSync(`${base}.md`, markdown(profile, out.leads, day));
    writeFileSync(`${base}.json`, `${JSON.stringify(out.leads, null, 2)}\n`);
    for (const l of out.leads) seen.add(leadKey(l));
    writeFileSync(seenFile, JSON.stringify([...seen]));
    return console.log(`\n✓ ${out.leads.length} new leads in ${base}.md`);
  }

  fail(`Unknown command "${cmd}".\n\n${HELP}`);
}

main().catch((e) => fail((e as Error).message));
