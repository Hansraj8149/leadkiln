export interface RunMessage {
  workspaceId: string;
  runId: string;
}

export interface Env {
  DB: D1Database;
  RUNS: Queue<RunMessage>;
  ASSETS: Fetcher;
  AI: Ai;

  /** Public address of the app, e.g. https://leadkiln.com. Used in emails. */
  APP_URL: string;
  /** A Workers AI model (@cf/…), or a Claude model id to use ANTHROPIC_API_KEY. */
  LEADKILN_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY: string;
  LEADKILN_FROM_EMAIL: string;
  /** 32 random bytes, base64. Encrypts each workspace's source keys. */
  LEADKILN_ENCRYPTION_KEY: string;

  LEMONSQUEEZY_API_KEY: string;
  LEMONSQUEEZY_STORE_ID: string;
  LEMONSQUEEZY_WEBHOOK_SECRET: string;
  /** JSON map of plan id to Lemon Squeezy variant id, e.g. {"solo":"123","team":"456"}. */
  LEMONSQUEEZY_VARIANTS: string;
}
