// Test helpers: D1 on node:sqlite with the real migrations, and an Env with fakes for the queue and assets.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Env, RunMessage } from "./env";

class Statement {
  private args: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}
  bind(...args: unknown[]) {
    this.args = args.map((a) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a));
    return this;
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.args as never[])) ?? null) as T | null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.args as never[])) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { success: true, results: [], meta: { changes: Number(r.changes) } };
  }
}

export function testDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = path.join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(path.join(dir, f), "utf8"));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}

export function testEnv(): Env & { sent: RunMessage[] } {
  const sent: RunMessage[] = [];
  return {
    DB: testDb(),
    RUNS: { send: async (m: RunMessage) => void sent.push(m) } as unknown as Queue<RunMessage>,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    APP_URL: "https://leadkiln.test",
    AI: {
      run: async () => ({ response: '{"need": "You need help with your automations.", "proof": ""}' }),
    } as unknown as Ai,
    LEADKILN_MODEL: "@cf/test",
    RESEND_API_KEY: "re_test",
    LEADKILN_FROM_EMAIL: "Leadkiln <hi@leadkiln.test>",
    LEADKILN_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    LEMONSQUEEZY_API_KEY: "ls",
    LEMONSQUEEZY_STORE_ID: "1",
    LEMONSQUEEZY_WEBHOOK_SECRET: "whsec",
    LEMONSQUEEZY_VARIANTS: '{"solo":"11","team":"22"}',
    sent,
  };
}
