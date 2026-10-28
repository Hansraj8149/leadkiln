import { describe, expect, it } from "vitest";
import { exampleProfile } from "@leadkiln/engine";
import { FakeModel } from "@leadkiln/llm";
import { createApi } from "./api";
import { decrypt } from "./crypto";
import { nextRunAt, one } from "./db";
import { enqueueDue, runWorkspace, type Deps } from "./run";
import { testEnv } from "./testing";

// Responses in these tests are read loosely; the assertions check their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Promise<Response> | Response): Promise<any> => (await res).json();

const NOW = Date.UTC(2026, 9, 28, 12);

const profile = {
  ...exampleProfile,
  name: "Acme",
  website: "https://acme.dev",
  intro: "I'm an independent developer in Lisbon.",
  proof: [{ id: "crm", text: "I built a CRM sync for a clinic.", about: "automation", offers: ["automation"] }],
  sources: { ...exampleProfile.sources, hnHiring: { enabled: true }, remoteok: { enabled: false } },
};

interface Sent {
  url: string;
  body: unknown;
}

/** Hacker News answers, plus Resend and webhooks, recorded. */
function fakeFetch() {
  const sent: Sent[] = [];
  const impl = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes("hn.algolia.com") && url.includes("author_whoishiring"))
      return Response.json({ hits: [{ objectID: "100", title: "Ask HN: Who is hiring? (October 2026)" }] });
    if (url.includes("hn.algolia.com"))
      return Response.json({
        hits: [
          {
            objectID: "1",
            parent_id: 100,
            author: "pat",
            created_at: new Date(NOW - 3_600_000).toISOString(),
            comment_text: "Acme | Automation engineer | REMOTE (US) | CONTRACT<p>n8n and Zapier, $90/hr",
          },
        ],
      });
    sent.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
    return Response.json({ id: "ok" });
  }) as unknown as typeof fetch;
  return { impl, sent };
}

function setup(model = new FakeModel(['{"need": "You need n8n and Zapier work done.", "proof": "crm"}'])) {
  const env = testEnv();
  const f = fakeFetch();
  const deps: Deps = { now: () => NOW, fetch: f.impl, model: () => model };
  const api = createApi(deps);
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await api.request(
      `/api${path}`,
      {
        method,
        headers: { cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return res;
  };
  const signIn = async (email = "sam@acme.dev") => {
    await call("POST", "/auth/start", { email });
    const link = (f.sent.find((s) => s.url.includes("resend")) as { body: { text: string } }).body.text;
    const token = link.match(/token=([\w-]+)/)![1];
    f.sent.length = 0;
    await call("GET", `/auth/verify?token=${token}`);
  };
  return { env, sent: f.sent, deps, call, signIn, model };
}

describe("sign-in", () => {
  it("needs a session", async () => {
    const { call } = setup();
    expect((await call("GET", "/me")).status).toBe(401);
  });

  it("works once per link and starts a trial", async () => {
    const { call, signIn } = setup();
    await signIn();
    const me = await json(call("GET", "/me"));
    expect(me).toMatchObject({ email: "sam@acme.dev", plan: { id: "trial" }, usage: { leads: 0 } });
  });

  it("refuses writes from another site", async () => {
    const { env } = setup();
    const res = await createApi().request(
      "/api/auth/start",
      { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("workspaces", () => {
  it("start from the example and refuse a run until placeholders are gone", async () => {
    const { call, signIn } = setup();
    await signIn();
    const { id } = await json(call("POST", "/workspaces", { name: "Acme" }));
    const ws = await json(call("GET", `/workspaces/${id}`));
    expect(ws.profile.name).toBe("Acme");
    expect(ws.placeholders.length).toBeGreaterThan(0);
    expect(ws.digestEmail).toBe("sam@acme.dev");
    expect((await call("POST", `/workspaces/${id}/runs`)).status).toBe(400);
    // The trial has one workspace.
    expect((await call("POST", "/workspaces", {})).status).toBe(402);
  });

  it("validate the profile", async () => {
    const { call, signIn } = setup();
    await signIn();
    const { id } = await json(call("POST", "/workspaces", {}));
    const bad = await call("PUT", `/workspaces/${id}/profile`, { ...profile, website: "not a url" });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatch(/website/);
    const ok = await json(call("PUT", `/workspaces/${id}/profile`, profile));
    expect(ok.placeholders).toEqual([]);
  });

  it("encrypt keys and never return them", async () => {
    const { env, call, signIn } = setup();
    await signIn();
    const { id } = await json(call("POST", "/workspaces", {}));
    const ws = await json(call("PUT", `/workspaces/${id}/keys`, { googlePlacesKey: "AIza-secret" }));
    expect(ws.keys.googlePlacesKey).toBe(true);
    expect(JSON.stringify(ws)).not.toContain("AIza-secret");
    const row = await one<{ value_enc: string }>(env.DB, "SELECT value_enc FROM workspace_keys");
    expect(await decrypt(env.LEADKILN_ENCRYPTION_KEY, row!.value_enc)).toBe("AIza-secret");
    expect((await call("PUT", `/workspaces/${id}/keys`, { other: "x" })).status).toBe(400);
  });

  it("only take a public https webhook", async () => {
    const { call, signIn } = setup();
    await signIn();
    const { id } = await json(call("POST", "/workspaces", {}));
    expect((await call("PUT", `/workspaces/${id}/settings`, { webhookUrl: "http://10.0.0.1/hook" })).status).toBe(400);
    expect((await call("PUT", `/workspaces/${id}/settings`, { webhookUrl: "https://hooks.slack.com/x" })).status).toBe(
      200,
    );
  });

  it("are private to their account", async () => {
    const a = setup();
    await a.signIn("a@a.dev");
    const { id } = await json(a.call("POST", "/workspaces", {}));
    await a.call("POST", "/auth/logout");
    await a.signIn("b@b.dev");
    expect((await a.call("GET", `/workspaces/${id}`)).status).toBe(404);
  });
});

describe("runs", () => {
  async function ready() {
    const t = setup();
    await t.signIn();
    const { id } = await json(t.call("POST", "/workspaces", {}));
    await t.call("PUT", `/workspaces/${id}/profile`, profile);
    await t.call("PUT", `/workspaces/${id}/settings`, { webhookUrl: "https://hooks.slack.com/x" });
    return { ...t, id };
  }

  it("find, store and report leads, once", async () => {
    const { env, call, id, sent, deps } = await ready();
    const queued = await call("POST", `/workspaces/${id}/runs`);
    expect(queued.status).toBe(202);
    expect(env.sent).toHaveLength(1);
    await runWorkspace(env, env.sent[0]!, deps);

    const { leads, counts } = await json(call("GET", `/workspaces/${id}/leads`));
    expect(counts.new).toBe(1);
    expect(leads[0]).toMatchObject({ source: "hn-hiring", offer: "automation", status: "new" });
    expect(leads[0].draft).toContain("I'd like to apply for the role in your post (Acme · Automation engineer).");
    expect(leads[0].draft).toContain("I built a CRM sync for a clinic.");

    const runs = await json(call("GET", `/workspaces/${id}/runs`));
    expect(runs[0]).toMatchObject({ status: "done", added: 1, model: "fake" });
    expect((await json(call("GET", "/me"))).usage.leads).toBe(1);

    // The digest went to the owner and the webhook; nothing else was contacted.
    expect(sent.map((s) => new URL(s.url).hostname).sort()).toEqual(["api.resend.com", "hooks.slack.com"]);
    expect((sent.find((s) => s.url.includes("slack"))!.body as { text: string }).text).toContain("Automation engineer");

    // A second run adds nothing new.
    env.sent.length = 0;
    await call("POST", `/workspaces/${id}/runs`);
    await runWorkspace(env, env.sent[0]!, deps);
    expect((await json(call("GET", `/workspaces/${id}/leads`))).counts.new).toBe(1);
  });

  it("let a person edit, note and move a lead, and export them", async () => {
    const { env, call, id, deps } = await ready();
    await call("POST", `/workspaces/${id}/runs`);
    await runWorkspace(env, env.sent[0]!, deps);
    const [lead] = (await json(call("GET", `/workspaces/${id}/leads`))).leads;
    const updated = await json(call("PUT", `/leads/${lead.id}`, { status: "sent", draft: "Hi Pat", note: "=cmd" }));
    expect(updated).toMatchObject({ status: "sent", draft: "Hi Pat", note: "=cmd" });
    const csv = await (await call("GET", `/workspaces/${id}/leads.csv`)).text();
    expect(csv.split("\n")[1]).toMatch(/^sent,/);
    expect(csv).toContain("'=cmd");
  });

  it("stop at the plan's monthly limit", async () => {
    const { env, call, id, deps } = await ready();
    await env.DB.prepare(
      "INSERT INTO usage (account_id, month, leads) SELECT account_id, '2026-10', 60 FROM workspaces",
    ).run();
    await call("POST", `/workspaces/${id}/runs`);
    await runWorkspace(env, env.sent[0]!, deps);
    const runs = await json(call("GET", `/workspaces/${id}/runs`));
    expect(runs[0]).toMatchObject({ status: "failed" });
    expect(runs[0].error).toMatch(/60 leads are used/);
  });

  it("queue due workspaces from the cron", async () => {
    const { env, id, deps } = await ready();
    await env.DB.prepare("UPDATE workspaces SET next_run_at = ? WHERE id = ?")
      .bind(NOW - 1, id)
      .run();
    env.sent.length = 0;
    expect(await enqueueDue(env, deps)).toBe(1);
    expect(env.sent).toHaveLength(1);
    const ws = await one<{ next_run_at: number }>(env.DB, "SELECT next_run_at FROM workspaces WHERE id = ?", id);
    expect(ws!.next_run_at).toBe(nextRunAt(6, NOW + 60_000));
  });
});
