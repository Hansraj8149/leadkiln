// Phrase matching shared by sources and scoring. Profiles hold plain phrases, never regular expressions, so a
// customer can't write one that hangs a run.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One case-insensitive regex for a list of phrases, matched as whole words where they start or end in one. */
export function phraseRegex(phrases: readonly string[]): RegExp | null {
  const parts = phrases
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `${/^\w/.test(p) ? "\\b" : ""}${escape(p).replace(/\s+/g, "[\\s-]+")}${/\w$/.test(p) ? "\\b" : ""}`);
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
}

/** The first phrase from the list found in the text, or undefined. */
export function firstPhrase(text: string, phrases: readonly string[]): string | undefined {
  return phrases.find((p) => phraseRegex([p])?.test(text));
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
