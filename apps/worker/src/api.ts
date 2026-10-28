import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { profileSchema, STATUSES, type LeadStatus } from "@leadkiln/core";
import { exampleProfile, placeholders, publicUrl } from "@leadkiln/engine";
import { KEY_NAMES } from "@leadkiln/sources";
import {
  endSession,
  finishLogin,
  SESSION_COOKIE,
  sessionCookie,
  sessionUser,
  startLogin,
  type SessionUser,
} from "./auth";
import { checkoutUrl, portalUrl, readWebhook } from "./billing";
import { encrypt, newId } from "./crypto";
import {
  all,
  exec,
  leadView,
  nextRunAt,
  one,
  runView,
  type AccountRow,
  type LeadRow,
  type RunRow,
  type WorkspaceRow,
} from "./db";
import type { Env } from "./env";
import { month, planFor, PLANS } from "./plans";
import { defaultDeps, queueRun, type Deps } from "./run";

type App = { Bindings: Env; Variables: { user: SessionUser } };
type Ctx = Context<App>;

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 402 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

async function body<T>(c: Ctx): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "Send JSON.");
  }
}

async function ownWorkspace(c: Ctx, id: string): Promise<WorkspaceRow> {
  const ws = await one<WorkspaceRow>(
    c.env.DB,
    "SELECT * FROM workspaces WHERE id = ? AND account_id = ?",
    id,
    c.get("user").accountId,
  );
  if (!ws) throw new HttpError(404, "No such workspace.");
  return ws;
}

async function ownLead(c: Ctx, id: string): Promise<LeadRow> {
  const lead = await one<LeadRow>(
    c.env.DB,
    "SELECT l.* FROM leads l JOIN workspaces w ON w.id = l.workspace_id WHERE l.id = ? AND w.account_id = ?",
    id,
    c.get("user").accountId,
  );
  if (!lead) throw new HttpError(404, "No such lead.");
  return lead;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function workspaceView(env: Env, w: WorkspaceRow) {
  const keys = await all<{ name: string }>(env.DB, "SELECT name FROM workspace_keys WHERE workspace_id = ?", w.id);
  const profile = JSON.parse(w.profile);
  return {
    id: w.id,
    profile,
    placeholders: placeholders(profileSchema.parse(profile)),
    paused: !!w.paused,
    runHour: w.run_hour,
    nextRunAt: w.next_run_at,
    digestEmail: w.digest_email,
    webhookUrl: w.webhook_url,
    keys: Object.fromEntries(KEY_NAMES.map((k) => [k, keys.some((r) => r.name === k)])),
    createdAt: w.created_at,
  };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function createApi(deps: Deps = defaultDeps) {
  const app = new Hono<App>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: err.message || "Something went wrong." }, 500);
  });

  // Requests that change something must come from the app itself.
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (
      c.req.method !== "GET" &&
      origin &&
      origin !== new URL(c.env.APP_URL).origin &&
      !c.req.path.endsWith("/billing/webhook")
    )
      throw new HttpError(403, "Cross-site request refused.");
    await next();
  });

  // --- Sign-in ----------------------------------------------------------------------------------------------------

  app.post("/auth/start", async (c) => {
    const { email } = await body<{ email?: string }>(c);
    await startLogin(c.env, email ?? "", deps.now(), deps.fetch).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    return c.json({ ok: true });
  });

  app.get("/auth/verify", async (c) => {
    try {
      const session = await finishLogin(c.env, c.req.query("token") ?? "", deps.now());
      c.header("set-cookie", sessionCookie(session));
      return c.redirect("/app");
    } catch (e) {
      return c.redirect(`/app/login?error=${encodeURIComponent((e as Error).message)}`);
    }
  });

  app.post("/auth/logout", async (c) => {
    const s = getCookie(c, SESSION_COOKIE);
    if (s) await endSession(c.env, s);
    c.header("set-cookie", sessionCookie("", 0));
    return c.json({ ok: true });
  });

  // Lemon Squeezy calls this without a session; the signature authenticates it.
  app.post("/billing/webhook", async (c) => {
    const raw = await c.req.text();
    const change = await readWebhook(c.env, raw, c.req.header("x-signature") ?? "").catch(() => {
      throw new HttpError(401, "Bad signature.");
    });
    if (change)
      await exec(
        c.env.DB,
        "UPDATE accounts SET plan = ?, plan_status = ?, ls_customer_id = ?, ls_subscription_id = ? WHERE id = ?",
        change.plan,
        change.status,
        change.customerId,
        change.subscriptionId,
        change.accountId,
      );
    return c.json({ ok: true });
  });

  // --- Everything below needs a session --------------------------------------------------------------------------

  app.use("*", async (c, next) => {
    const user = await sessionUser(c.env, getCookie(c, SESSION_COOKIE), deps.now());
    if (!user) throw new HttpError(401, "Sign in first.");
    c.set("user", user);
    await next();
  });

  app.get("/me", async (c) => {
    const user = c.get("user");
    const account = (await one<AccountRow>(c.env.DB, "SELECT * FROM accounts WHERE id = ?", user.accountId))!;
    const usage = await one<{ leads: number }>(
      c.env.DB,
      "SELECT leads FROM usage WHERE account_id = ? AND month = ?",
      user.accountId,
      month(deps.now()),
    );
    return c.json({
      email: user.email,
      plan: planFor(account.plan),
      planStatus: account.plan_status,
      plans: Object.values(PLANS).filter((p) => p.id !== "trial"),
      hasSubscription: !!account.ls_subscription_id,
      usage: { month: month(deps.now()), leads: usage?.leads ?? 0 },
    });
  });

  // --- Workspaces -------------------------------------------------------------------------------------------------

  app.get("/workspaces", async (c) => {
    const rows = await all<WorkspaceRow & { fresh: number }>(
      c.env.DB,
      `SELECT w.*, (SELECT COUNT(*) FROM leads l WHERE l.workspace_id = w.id AND l.status = 'new') AS fresh
       FROM workspaces w WHERE w.account_id = ? ORDER BY w.created_at`,
      c.get("user").accountId,
    );
    return c.json(
      rows.map((w) => ({
        id: w.id,
        name: JSON.parse(w.profile).name as string,
        paused: !!w.paused,
        nextRunAt: w.next_run_at,
        newLeads: w.fresh,
      })),
    );
  });

  app.post("/workspaces", async (c) => {
    const { name } = await body<{ name?: string }>(c);
    const user = c.get("user");
    const account = (await one<AccountRow>(c.env.DB, "SELECT * FROM accounts WHERE id = ?", user.accountId))!;
    const count = await one<{ n: number }>(
      c.env.DB,
      "SELECT COUNT(*) AS n FROM workspaces WHERE account_id = ?",
      user.accountId,
    );
    const plan = planFor(account.plan);
    if ((count?.n ?? 0) >= plan.workspaces)
      throw new HttpError(
        402,
        `The ${plan.name} plan has ${plan.workspaces} workspace${plan.workspaces > 1 ? "s" : ""}. Upgrade for more.`,
      );
    const id = newId();
    const profile = { ...exampleProfile, name: name?.trim().slice(0, 80) || exampleProfile.name };
    await exec(
      c.env.DB,
      "INSERT INTO workspaces (id, account_id, profile, digest_email, next_run_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      user.accountId,
      JSON.stringify(profile),
      user.email,
      nextRunAt(6, deps.now()),
      deps.now(),
    );
    return c.json({ id }, 201);
  });

  app.get("/workspaces/:id", async (c) => c.json(await workspaceView(c.env, await ownWorkspace(c, c.req.param("id")))));

  app.put("/workspaces/:id/profile", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const parsed = profileSchema.safeParse(await body(c));
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "profile"}: ${i.message}`)
          .join("; "),
      );
    const ids = parsed.data.offers.map((o) => o.id);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Two offers share an id.");
    await exec(c.env.DB, "UPDATE workspaces SET profile = ? WHERE id = ?", JSON.stringify(parsed.data), ws.id);
    return c.json(await workspaceView(c.env, { ...ws, profile: JSON.stringify(parsed.data) }));
  });

  app.put("/workspaces/:id/settings", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const b = await body<{
      paused?: boolean;
      runHour?: number;
      digestEmail?: string | null;
      webhookUrl?: string | null;
    }>(c);
    const runHour = b.runHour ?? ws.run_hour;
    if (!Number.isInteger(runHour) || runHour < 0 || runHour > 23)
      throw new HttpError(400, "Pick an hour from 0 to 23.");
    const digestEmail = b.digestEmail === undefined ? ws.digest_email : b.digestEmail?.trim() || null;
    if (digestEmail && !EMAIL.test(digestEmail)) throw new HttpError(400, "That email address doesn't look right.");
    const webhookUrl = b.webhookUrl === undefined ? ws.webhook_url : b.webhookUrl?.trim() || null;
    if (webhookUrl && publicUrl(webhookUrl)?.protocol !== "https:")
      throw new HttpError(400, "The webhook must be a public https address.");
    const paused = b.paused ?? !!ws.paused;
    await exec(
      c.env.DB,
      "UPDATE workspaces SET paused = ?, run_hour = ?, next_run_at = ?, digest_email = ?, webhook_url = ? WHERE id = ?",
      paused ? 1 : 0,
      runHour,
      paused ? null : nextRunAt(runHour, deps.now()),
      digestEmail,
      webhookUrl,
      ws.id,
    );
    return c.json(await workspaceView(c.env, (await ownWorkspace(c, ws.id))!));
  });

  // {name: value} sets a key, {name: null} removes it. Keys are never sent back.
  app.put("/workspaces/:id/keys", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const b = await body<Record<string, string | null>>(c);
    for (const [name, value] of Object.entries(b)) {
      if (!(KEY_NAMES as readonly string[]).includes(name)) throw new HttpError(400, `Unknown key "${name}".`);
      if (value === null || value.trim() === "")
        await exec(c.env.DB, "DELETE FROM workspace_keys WHERE workspace_id = ? AND name = ?", ws.id, name);
      else {
        if (value.length > 500) throw new HttpError(400, "That key is too long.");
        await exec(
          c.env.DB,
          `INSERT INTO workspace_keys (workspace_id, name, value_enc) VALUES (?, ?, ?)
           ON CONFLICT (workspace_id, name) DO UPDATE SET value_enc = excluded.value_enc`,
          ws.id,
          name,
          await encrypt(c.env.LEADKILN_ENCRYPTION_KEY, value.trim()),
        );
      }
    }
    return c.json(await workspaceView(c.env, ws));
  });

  app.delete("/workspaces/:id", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    await exec(c.env.DB, "DELETE FROM workspaces WHERE id = ?", ws.id);
    return c.json({ ok: true });
  });

  // --- Runs -------------------------------------------------------------------------------------------------------

  app.post("/workspaces/:id/runs", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const left = placeholders(profileSchema.parse(JSON.parse(ws.profile)));
    if (left.length) throw new HttpError(400, "Replace the [placeholder] text in the profile first.");
    return c.json({ id: await queueRun(c.env, ws.id, "manual", deps.now()) }, 202);
  });

  app.get("/workspaces/:id/runs", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const rows = await all<RunRow>(
      c.env.DB,
      "SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 30",
      ws.id,
    );
    return c.json(rows.map(runView));
  });

  // --- Leads ------------------------------------------------------------------------------------------------------

  app.get("/workspaces/:id/leads", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const status = (c.req.query("status") ?? "new") as LeadStatus;
    if (!STATUSES.includes(status)) throw new HttpError(400, "Unknown status.");
    const offer = c.req.query("offer");
    const [rows, counts] = await Promise.all([
      all<LeadRow>(
        c.env.DB,
        `SELECT * FROM leads WHERE workspace_id = ? AND status = ? ${offer ? "AND offer = ?" : ""}
         ORDER BY ${status === "new" ? "score DESC, found_at DESC" : "updated_at DESC"} LIMIT 300`,
        ...[ws.id, status, ...(offer ? [offer] : [])],
      ),
      all<{ status: LeadStatus; n: number }>(
        c.env.DB,
        "SELECT status, COUNT(*) AS n FROM leads WHERE workspace_id = ? GROUP BY status",
        ws.id,
      ),
    ]);
    return c.json({
      leads: rows.map(leadView),
      counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((r) => r.status === s)?.n ?? 0])),
    });
  });

  app.get("/workspaces/:id/leads.csv", async (c) => {
    const ws = await ownWorkspace(c, c.req.param("id"));
    const rows = await all<LeadRow>(
      c.env.DB,
      "SELECT * FROM leads WHERE workspace_id = ? ORDER BY found_at DESC",
      ws.id,
    );
    const head = ["status", "score", "offer", "source", "title", "url", "contact", "site", "country", "found", "note"];
    const lines = rows.map((l) =>
      [
        l.status,
        l.score,
        l.offer,
        l.source,
        l.title,
        l.url,
        l.contact,
        l.site_url,
        l.country,
        new Date(l.found_at).toISOString(),
        l.note,
      ]
        .map(csvCell)
        .join(","),
    );
    return c.body([head.join(","), ...lines].join("\n"), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${month(deps.now())}.csv"`,
    });
  });

  app.get("/leads/:id", async (c) => c.json(leadView(await ownLead(c, c.req.param("id")))));

  app.put("/leads/:id", async (c) => {
    const lead = await ownLead(c, c.req.param("id"));
    const { status, draft, note } = await body<{ status?: LeadStatus; draft?: string; note?: string }>(c);
    if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, "Unknown status.");
    if (draft !== undefined && (typeof draft !== "string" || draft.length > 5000))
      throw new HttpError(400, "The draft is too long.");
    if (note !== undefined && (typeof note !== "string" || note.length > 2000))
      throw new HttpError(400, "The note is too long.");
    await exec(
      c.env.DB,
      "UPDATE leads SET status = ?, draft = ?, note = ?, updated_at = ? WHERE id = ?",
      status ?? lead.status,
      draft ?? lead.draft,
      note ?? lead.note,
      deps.now(),
      lead.id,
    );
    return c.json(leadView((await ownLead(c, lead.id))!));
  });

  // --- Billing ----------------------------------------------------------------------------------------------------

  app.post("/billing/checkout", async (c) => {
    const { plan } = await body<{ plan?: string }>(c);
    const user = c.get("user");
    const url = await checkoutUrl(c.env, plan ?? "", user.accountId, user.email, deps.fetch).catch((e: Error) => {
      throw new HttpError(400, e.message);
    });
    return c.json({ url });
  });

  app.get("/billing/portal", async (c) => {
    const account = (await one<AccountRow>(c.env.DB, "SELECT * FROM accounts WHERE id = ?", c.get("user").accountId))!;
    if (!account.ls_subscription_id) throw new HttpError(400, "No subscription yet.");
    return c.json({ url: await portalUrl(c.env, account.ls_subscription_id, deps.fetch) });
  });

  return app;
}
