// A first message for each lead, for a person to edit and send. Every claim about the sender is fixed text from the
// profile (intro and proof). The model writes one sentence about what the lead needs, in their terms, and picks the
// proof that fits; asked for more, models mirror a post's requirements back as claims, so it isn't asked for more.
import type { Fit, Profile, RawLead } from "@leadkiln/core";
import { readJson, type TextModel } from "@leadkiln/llm";

export function rules(profile: Profile) {
  const proofList = profile.proof.map((p) => `${p.id} = ${p.about}`).join("\n");
  return `You read one online post and answer with JSON only: {"need": "...", "proof": "..."}.

"need": one sentence, at most 30 words, that restates what the poster needs, in their own terms, starting with "You". Describe them, never the reader. No claims about anyone else, no praise, no numbers that aren't in the post.

"proof": the one key from this list most relevant to their need${proofList ? "" : ' (the list is empty, so answer "")'}:
${proofList}`;
}

export interface DraftParts {
  need: string;
  proof?: string;
}

/** Asks the model, and keeps only answers that pass the checks; anything else falls back to fixed text. */
export async function askModel(model: TextModel | null, profile: Profile, lead: RawLead): Promise<DraftParts> {
  if (!model) return { need: "" };
  try {
    const parsed = readJson<{ need?: string; proof?: string }>(
      await model.complete(rules(profile), `${lead.title}\n\n${lead.body.slice(0, 1500)}`),
    );
    const sentence = parsed?.need?.trim() ?? "";
    const ok =
      /^you\b/i.test(sentence) && sentence.split(/\s+/).length <= 35 && !/\bI\b|\bwe\b|\bmy\b|\bour\b/.test(sentence);
    return {
      need: ok ? (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`) : "",
      proof: profile.proof.some((p) => p.id === parsed?.proof) ? parsed?.proof : undefined,
    };
  } catch {
    return { need: "" };
  }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function compose(profile: Profile, lead: RawLead, fit: Fit, facts: string[], parts: DraftParts): string {
  const offer = profile.offers.find((o) => o.id === fit.offer) ?? profile.offers[0]!;
  const proof =
    profile.proof.find((p) => p.id === parts.proof) ??
    profile.proof.find((p) => p.offers.includes(offer.id)) ??
    profile.proof[0];
  const job = lead.source === "hn-hiring" || lead.source === "remoteok";
  // Handles aren't names: greet by name only when the author field looks like one ("Dana", not "dana_k" or a company).
  const name = job || lead.source === "places" ? undefined : lead.author?.replace(/^(u\/|@)/, "");
  const hi = name && /^[A-Z][a-z]{1,19}$/.test(name) ? `Hi ${name},` : "Hi,";
  const role = lead.title.split("|").slice(0, 2).join("·").trim();

  const opening = job
    ? // Models read a job ad as the poster looking for work, so job ads keep the plain opening.
      `I'd like to apply for the role in your post (${role}).`
    : lead.source === "places"
      ? `I came across your business on Google Maps.${facts[0] ? ` Looking at your website, I noticed: ${lower(facts[0])}.` : ""}`
      : `${parts.need || `I saw your post about ${offer.label}.`}${facts[0] ? ` I had a quick look at your homepage: ${lower(facts[0])}.` : ""}`;

  const who = [profile.intro, proof?.text].filter(Boolean).join(" ");
  const link = offer.link ?? profile.website;
  const ask = job ? profile.jobAsk : profile.ask;
  return `${hi}\n\n${opening}\n\n${who} More here: ${link}\n\n${ask}\n\n${profile.sender}`;
}
