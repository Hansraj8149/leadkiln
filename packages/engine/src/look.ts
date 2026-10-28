// One look at a lead's homepage: a single GET, like any visitor's browser before it runs JavaScript. No security
// probing, nothing stored but the facts below.
import { USER_AGENT } from "@leadkiln/sources";

export interface Facts {
  reached: boolean;
  status?: number;
  https?: boolean;
  builder?: string;
  title?: string;
  description?: boolean;
  viewport?: boolean;
  /** Words of readable text before JavaScript: near zero means search engines and AI bots see an empty page. */
  words?: number;
}

const MAX = 1_000_000;

/** Public web addresses only: no IPs, no local names, http or https. */
export function publicUrl(raw?: string): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname;
    if (
      !/^https?:$/.test(url.protocol) ||
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      host.startsWith("[") ||
      /(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

const BUILDERS: [string, RegExp][] = [
  ["Lovable", /lovable\.app|lovable-tagger|gpteng(ineer)?/i],
  ["Bolt", /bolt\.new|\.bolt\.host|stackblitz/i],
  ["v0", /v0\.dev|vusercontent/i],
  ["Framer", /framerusercontent|framer\.com\/m\//i],
  ["Webflow", /webflow\.(com|io)|wf-page/i],
  ["Wix", /wixstatic|wix\.com/i],
  ["Squarespace", /squarespace/i],
  ["WordPress", /wp-content|wp-includes/i],
  ["Shopify", /cdn\.shopify|myshopify/i],
  ["Bubble", /bubble\.io|bubbleapps/i],
];

async function readCapped(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, size - at), at);
    at += c.length;
  }
  return new TextDecoder().decode(all);
}

export async function look(raw: string | undefined, fetchImpl: typeof fetch = fetch): Promise<Facts | null> {
  const url = publicUrl(raw);
  if (!url) return null;
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const final = new URL(res.url || url);
    const html = await readCapped(res);
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<head[\s\S]*?<\/head>/i, " ")
      .replace(/<[^>]+>/g, " ");
    return {
      reached: res.ok,
      status: res.status,
      https: final.protocol === "https:",
      builder: BUILDERS.find(([, re]) => re.test(`${final.hostname} ${html.slice(0, 200_000)}`))?.[0],
      title:
        html
          .match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
          ?.trim()
          .slice(0, 120) || undefined,
      description: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html),
      viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      words: body.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w)).length,
    };
  } catch {
    return { reached: false };
  }
}

/** The facts worth mentioning, in plain words. Only what the GET showed; never a guess. */
export function factLines(f: Facts | null): string[] {
  if (!f) return [];
  if (!f.reached) return [f.status ? `Homepage answered with an error (${f.status})` : "Homepage didn't load"];
  const lines: string[] = [];
  if (f.builder) lines.push(`Built with ${f.builder}`);
  if ((f.words ?? 0) < 40) lines.push("Almost no text before JavaScript runs, so search engines see a near-empty page");
  if (!f.title) lines.push("No page title");
  if (!f.description) lines.push("No meta description");
  if (!f.viewport) lines.push("No mobile viewport tag, so it may not fit phone screens");
  if (!f.https) lines.push("Not on https");
  return lines;
}
