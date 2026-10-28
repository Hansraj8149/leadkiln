import { escapeHtml, PRODUCT } from "@leadkiln/core";
import type { Env } from "./env";

interface Mail {
  to: string;
  subject: string;
  /** Plain paragraphs; links are given separately so the HTML stays simple. */
  lines: string[];
  link?: { href: string; label: string };
  list?: { title: string; items: string[] };
}

function html(m: Mail): string {
  const p = (s: string) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(s)}</p>`;
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1a1a1a">
${m.lines.map(p).join("\n")}
${m.link ? `<p style="margin:24px 0"><a href="${escapeHtml(m.link.href)}" style="background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(m.link.label)}</a></p>` : ""}
${m.list?.items.length ? `<p style="margin:0 0 8px"><strong>${escapeHtml(m.list.title)}</strong></p><ul>${m.list.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
<p style="color:#666;font-size:13px">${PRODUCT.name}</p></div>`;
}

const text = (m: Mail) =>
  [
    ...m.lines,
    ...(m.link ? [`${m.link.label}: ${m.link.href}`] : []),
    ...(m.list?.items.length ? [m.list.title, ...m.list.items.map((i) => `- ${i}`)] : []),
  ].join("\n\n");

export async function sendMail(env: Env, m: Mail, fetchImpl: typeof fetch = fetch): Promise<void> {
  // Local development: RESEND_API_KEY=log prints the email instead of sending it.
  if (env.RESEND_API_KEY === "log") return void console.log(`\n[email to ${m.to}] ${m.subject}\n${text(m)}\n`);
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.LEADKILN_FROM_EMAIL, to: m.to, subject: m.subject, html: html(m), text: text(m) }),
  });
  if (!res.ok) throw new Error(`Resend answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
