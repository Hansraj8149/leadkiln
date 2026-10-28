# Leadkiln

People asking in public for what you sell, found every morning, with a first message ready for you to send.

Leadkiln reads Hacker News, Reddit, RemoteOK, Product Hunt, Google Maps and any RSS feed. It keeps the posts that ask
for what you do, scores each one with its reasons, looks once at the lead's homepage, and drafts a first message from
your own words. **It never sends anything.** You read the draft, make it yours, and send it where they posted.

It fits anyone who sells a service: freelancers, dev and design studios, agencies (one workspace per client), local
trades looking for businesses with weak websites.

## How a run works

1. **Read:** every enabled source, through its public API or feed. A source that fails or lacks a key is recorded and
   skipped; the others carry on.
2. **Filter:** posts already seen, people selling rather than buying, unpaid or equity-only work, closed ads, and any
   phrase you exclude. Job ads must name one of your offers or tools.
3. **Score:** plain rules, every point explained ("Asks for automation", "Mentions a budget or rate", "In a market you
   want (US)", "Posted in the last day"). Below your minimum score, a post is dropped.
4. **Look:** one GET of the lead's homepage, like any visitor, noting only what it shows (no title, no mobile
   viewport, almost no text before JavaScript, built with Webflow…). For Google Maps leads, a business with a solid
   site is dropped.
5. **Draft:** your introduction and one piece of your proof, word for word, plus a link to your page for that offer.
   A model writes one sentence restating what the lead needs and picks the proof; a sentence that makes claims
   ("I have 10 years…") is thrown away and the draft falls back to fixed text. With no model set, drafts are fixed
   text.
6. **Deliver:** the hosted app keeps leads in an inbox (New → Sent → Replied → Won, or Skipped), emails a digest and
   posts to a webhook (Slack, Discord or your own). The command line writes Markdown and JSON.

## Layout

| Path               | What it is                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| `packages/core`    | Profile schema, lead types, phrase matching, the product name          |
| `packages/sources` | One reader per source                                                  |
| `packages/llm`     | Workers AI (binding or REST), Claude through the Anthropic SDK, a fake |
| `packages/engine`  | Scoring, the homepage look, drafting, a whole run                      |
| `apps/worker`      | Hosted API, hourly cron and queue on Cloudflare Workers                |
| `apps/web`         | Landing page and dashboard (React)                                     |
| `apps/cli`         | Self-hosted command line                                               |

## The profile

Everything a run does comes from one profile per workspace (`packages/core/src/profile.ts`):

- **Who you are:** business name, website, sign-off name, a one- or two-sentence introduction, closing lines.
- **Offers:** what you sell, the words a post uses when it needs it, and your page about it.
- **Proof:** sentences about work you've shipped, as you'd say them. The only claims a message makes about you.
- **Fit:** your tools, the markets you want, phrases that rule a post out, the minimum score, leads per day.
- **Sources:** which to read, with their settings (subreddits, phrases, trades and cities, feeds).

Profiles hold plain phrases, never regular expressions. A new profile starts from an example with `[bracketed]`
placeholders, and no run starts until they're replaced.

## Sources

| Source                                        | Needs                                                       |
| --------------------------------------------- | ----------------------------------------------------------- |
| Hacker News "Who is hiring?" (contract posts) | nothing                                                     |
| Show HN launches matching your phrases        | nothing                                                     |
| RemoteOK contract and part-time roles         | nothing                                                     |
| Reddit posts asking for help or to hire       | a Reddit "script" app id and secret (reddit.com/prefs/apps) |
| Product Hunt launches matching your phrases   | a developer token (producthunt.com/v2/oauth/applications)   |
| Google Maps businesses with no or a weak site | a Places API (New) key with billing on                      |
| Any RSS or Atom feed                          | nothing                                                     |

## Run it yourself (command line)

```bash
pnpm install
cp .env.example .env              # optional: a model key, and keys for Reddit, Product Hunt, Google Places
pnpm leadkiln init                # writes leadkiln.config.json; replace every [bracketed] sentence
pnpm leadkiln sources             # checks each enabled source
pnpm leadkiln run --dry-run       # prints the leads
pnpm leadkiln run                 # writes out/leads-<date>.md and .json, and remembers what it has seen
```

For the one-sentence summary, set `ANTHROPIC_API_KEY` (model `LEADKILN_MODEL`, default `claude-opus-5-5`) or
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for Workers AI. Schedule `pnpm leadkiln run` with cron for a daily
list.

## Hosted (Cloudflare)

`apps/worker` is the API, the hourly cron (it queues each workspace at its chosen hour) and the queue consumer (one
workspace per message). It also serves `apps/web`: the landing page at `/` and the dashboard at `/app`.

```bash
cd apps/worker
npx wrangler d1 create leadkiln                 # put the id in wrangler.jsonc
npx wrangler queues create leadkiln-runs
npx wrangler queues create leadkiln-runs-dlq
pnpm db:migrate
npx wrangler secret put LEADKILN_ENCRYPTION_KEY # openssl rand -base64 32
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put LEADKILN_FROM_EMAIL     # e.g. Leadkiln <hello@leadkiln.com>
pnpm deploy
```

Locally: copy `.dev.vars.example` to `.dev.vars` (`RESEND_API_KEY=log` prints sign-in links and digests to the
terminal), run `pnpm db:migrate:local`, build the web app (`pnpm --filter @leadkiln/web build`) and `pnpm dev`, then
open http://localhost:8787.

Drafts use Workers AI through the `AI` binding by default (free tier). Set `LEADKILN_MODEL` to a Claude model id and add
`ANTHROPIC_API_KEY` to use Claude instead. Source keys are stored per workspace, encrypted with AES-GCM.

Billing is Lemon Squeezy: one subscription product with a variant per plan (`solo`, `team`), their ids in
`LEMONSQUEEZY_VARIANTS` as `{"solo":"…","team":"…"}`, and a webhook for the `subscription_*` events pointed at
`/api/billing/webhook`. Plan limits live in `apps/worker/src/plans.ts`.

## Develop

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

## Rules the code keeps

- Nothing is ever sent to a lead. Digests and webhooks go to the workspace owner only.
- A message says nothing about the sender beyond the profile's introduction and proof.
- Sources are public APIs and feeds; every lead links back to the original post.
- A lead's homepage gets one ordinary GET. Private and local addresses are never fetched, and webhooks must be public
  https.
- Contact details are kept only when the lead published them (an email in their post, a business phone on its map
  listing).

## Licence

AGPL-3.0. You can self-host it; if you offer a modified version as a service, share your changes.
