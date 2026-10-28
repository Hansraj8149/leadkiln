// After a run that found something: an email with the best leads and their drafts, and a webhook (Slack, Discord or
// anything else). Both go to the workspace owner only. A digest that fails to send never fails the run.
import { escapeHtml, PRODUCT, SOURCE_LABELS, type Profile, type Source } from "@leadkiln/core";
import { publicUrl } from "@leadkiln/engine";
import { all, type LeadRow, type WorkspaceRow } from "./db";
import type { Env } from "./env";

export async function sendDigest(env: Env, ws: WorkspaceRow, profile: Profile, ids: string[], fetchImpl: typeof fetch) {
  const leads = await all<LeadRow>(
    env.DB,
    `SELECT * FROM leads WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY score DESC LIMIT 10`,
    ...ids,
  );
  if (!leads.length) return;
  const inbox = `${env.APP_URL}/app/w/${ws.id}`;
  const offer = (id: string) => profile.offers.find((o) => o.id === id)?.label ?? id;
  const subject = `${ids.length} new ${ids.length === 1 ? "lead" : "leads"} for ${profile.name}: ${leads[0]!.title.slice(0, 60)}`;

  const tasks: Promise<unknown>[] = [];
  if (ws.digest_email) tasks.push(email(env, ws.digest_email, subject, leads, offer, inbox, ids.length, fetchImpl));
  const hook = publicUrl(ws.webhook_url ?? undefined);
  if (hook?.protocol === "https:") {
    const text = [
      `${subject}`,
      ...leads.map((l) => `• ${l.score} · ${offer(l.offer)} · ${l.title}\n  ${l.url}`),
      `Open the inbox: ${inbox}`,
    ].join("\n");
    tasks.push(
      fetchImpl(hook, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": `${PRODUCT.name} webhook` },
        body: JSON.stringify({
          event: "leads.found",
          text,
          content: text.slice(0, 1900),
          workspace: { id: ws.id, name: profile.name },
          leads: leads.map((l) => ({
            title: l.title,
            url: l.url,
            source: l.source,
            offer: l.offer,
            score: l.score,
            why: JSON.parse(l.why),
            contact: l.contact,
            draft: l.draft,
            reviewUrl: `${env.APP_URL}/app/leads/${l.id}`,
          })),
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "rejected") console.error("digest:", r.reason);
}

async function email(
  env: Env,
  to: string,
  subject: string,
  leads: LeadRow[],
  offer: (id: string) => string,
  inbox: string,
  total: number,
  fetchImpl: typeof fetch,
) {
  const items = leads.map((l) => {
    const why = JSON.parse(l.why) as string[];
    const facts = JSON.parse(l.facts) as string[];
    return `<div style="border-top:1px solid #ddd;padding:16px 0">
  <p style="margin:0 0 4px;font-size:14px;color:#555">${escapeHtml(SOURCE_LABELS[l.source as Source] ?? l.source)} · ${escapeHtml(offer(l.offer))} · score ${l.score}</p>
  <p style="margin:0 0 8px;font-size:17px"><a href="${escapeHtml(l.url)}">${escapeHtml(l.title)}</a></p>
  ${why.length ? `<p style="margin:0 0 6px;font-size:15px;color:#333">Why: ${escapeHtml(why.join(", "))}</p>` : ""}
  ${facts.length ? `<p style="margin:0 0 6px;font-size:15px;color:#333">Their site: ${escapeHtml(facts.join("; "))}</p>` : ""}
  ${l.contact ? `<p style="margin:0 0 6px;font-size:15px">Contact: ${escapeHtml(l.contact)}</p>` : ""}
  <pre style="white-space:pre-wrap;font-family:inherit;font-size:16px;background:#f5f5f5;padding:12px;margin:8px 0 0">${escapeHtml(l.draft)}</pre>
  <p style="margin:8px 0 0;font-size:15px"><a href="${env.APP_URL}/app/leads/${l.id}">Edit the draft and mark it sent</a></p>
</div>`;
  });
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;line-height:1.55;color:#1a1a1a">
<p style="font-size:17px">${total} new ${total === 1 ? "lead" : "leads"}${total > leads.length ? `, the best ${leads.length} below` : ""}. Edit each draft, send it yourself, then mark it sent in <a href="${inbox}">your inbox</a>.</p>
${items.join("\n")}
<p style="color:#666;font-size:13px">${PRODUCT.name}</p></div>`;

  if (env.RESEND_API_KEY === "log") return void console.log(`\n[digest to ${to}] ${subject}\n`);
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.LEADKILN_FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend answered HTTP ${res.status}`);
}
