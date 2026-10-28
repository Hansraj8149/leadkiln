-- Leadkiln hosted schema. Times are Unix milliseconds. Secrets are AES-GCM ciphertext (see src/crypto.ts).
-- Nothing here is ever sent to a lead: Leadkiln finds and drafts, a person sends.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_status TEXT NOT NULL DEFAULT 'active',
  ls_customer_id TEXT,
  ls_subscription_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- One business or offer being prospected for. An agency can keep one per client.
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Profile JSON from @leadkiln/core
  profile TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  -- The daily run's hour, UTC
  run_hour INTEGER NOT NULL DEFAULT 6,
  next_run_at INTEGER,
  digest_email TEXT,
  -- https only; receives {event: "leads.found", text, leads} (Slack and Discord read `text`/`content`)
  webhook_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX workspaces_due ON workspaces (paused, next_run_at);

-- Per-workspace source credentials (Reddit app, Product Hunt token, Google Places key).
CREATE TABLE workspace_keys (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_enc TEXT NOT NULL,
  PRIMARY KEY (workspace_id, name)
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  -- The source's own id, so a rerun never adds the same post twice.
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author TEXT,
  -- Only what the lead published themselves.
  contact TEXT,
  site_url TEXT,
  country TEXT,
  offer TEXT NOT NULL,
  score INTEGER NOT NULL,
  -- JSON string arrays: why it scored what it did, and what one GET of their homepage showed.
  why TEXT NOT NULL DEFAULT '[]',
  facts TEXT NOT NULL DEFAULT '[]',
  draft TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- new | sent | replied | won | skipped
  status TEXT NOT NULL DEFAULT 'new',
  posted_at TEXT,
  found_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, source, source_id)
);
CREATE INDEX leads_inbox ON leads (workspace_id, status, score DESC);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- queued | running | done | failed
  status TEXT NOT NULL,
  -- schedule | manual
  trigger TEXT NOT NULL,
  model TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  -- JSON [{source, found, kept, error?}]
  sources TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX runs_workspace ON runs (workspace_id, created_at);

CREATE TABLE usage (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- YYYY-MM
  month TEXT NOT NULL,
  leads INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, month)
);
