// Magic-link sign-in. Only hashes of tokens and session ids are stored.
import { PRODUCT } from "@leadkiln/core";
import { newId, randomToken, sha256 } from "./crypto";
import { exec, one } from "./db";
import { sendMail } from "./email";
import type { Env } from "./env";

export const SESSION_COOKIE = "lk_session";
const LINK_TTL = 15 * 60_000;
const SESSION_TTL = 30 * 86_400_000;

export interface SessionUser {
  userId: string;
  accountId: string;
  email: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function startLogin(env: Env, rawEmail: string, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new Error("That doesn't look like an email address.");
  const recent = await one<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND expires_at > ?",
    email,
    now - 60 * 60_000 + LINK_TTL,
  );
  if ((recent?.n ?? 0) >= 5) throw new Error("Too many sign-in links. Try again in an hour.");
  const token = randomToken();
  await exec(
    env.DB,
    "INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)",
    await sha256(token),
    email,
    now + LINK_TTL,
  );
  await sendMail(
    env,
    {
      to: email,
      subject: `Sign in to ${PRODUCT.name}`,
      lines: [
        "Use this link to sign in. It works once and expires in 15 minutes.",
        "If you didn't ask for it, ignore this email.",
      ],
      link: { href: `${env.APP_URL}/api/auth/verify?token=${token}`, label: `Sign in to ${PRODUCT.name}` },
    },
    fetchImpl,
  );
}

/** Uses a sign-in token and returns a new session id, creating the user and account on first sign-in. */
export async function finishLogin(env: Env, token: string, now = Date.now()): Promise<string> {
  const hash = await sha256(token);
  const row = await one<{ email: string; expires_at: number; used_at: number | null }>(
    env.DB,
    "SELECT email, expires_at, used_at FROM login_tokens WHERE token_hash = ?",
    hash,
  );
  if (row?.used_at) throw new Error("This sign-in link was already used. Ask for a new one.");
  if (!row || row.expires_at < now) throw new Error("This sign-in link has expired. Ask for a new one.");
  // Mark it used first, conditionally, so two clicks can't both sign in.
  const used = await exec(
    env.DB,
    "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
    now,
    hash,
  );
  if (!used.meta.changes) throw new Error("This sign-in link was already used.");

  let user = await one<{ id: string }>(env.DB, "SELECT id FROM users WHERE email = ?", row.email);
  if (!user) {
    const accountId = newId();
    user = { id: newId() };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)").bind(accountId, now),
      env.DB.prepare("INSERT INTO users (id, account_id, email, created_at) VALUES (?, ?, ?, ?)").bind(
        user.id,
        accountId,
        row.email,
        now,
      ),
    ]);
  }
  const session = randomToken();
  await exec(
    env.DB,
    "INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)",
    await sha256(session),
    user.id,
    now + SESSION_TTL,
  );
  return session;
}

export async function sessionUser(
  env: Env,
  session: string | undefined,
  now = Date.now(),
): Promise<SessionUser | null> {
  if (!session) return null;
  return one<SessionUser>(
    env.DB,
    `SELECT u.id AS userId, u.account_id AS accountId, u.email AS email
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?`,
    await sha256(session),
    now,
  );
}

export async function endSession(env: Env, session: string) {
  await exec(env.DB, "DELETE FROM sessions WHERE id_hash = ?", await sha256(session));
}

export function sessionCookie(value: string, maxAgeMs = SESSION_TTL) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
}
