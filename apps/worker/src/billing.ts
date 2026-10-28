// Lemon Squeezy as merchant of record: hosted checkout, signed webhooks that set the account's plan, and the
// customer portal for changes and cancellations.
import { hmacHex, safeEqual } from "./crypto";
import type { Env } from "./env";
import { PLANS } from "./plans";

const API = "https://api.lemonsqueezy.com/v1";

const variants = (env: Env): Record<string, string> => JSON.parse(env.LEMONSQUEEZY_VARIANTS || "{}");

export function planForVariant(env: Env, variantId: string | number): string | null {
  const hit = Object.entries(variants(env)).find(([, v]) => String(v) === String(variantId));
  return hit ? hit[0] : null;
}

async function ls<T>(env: Env, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
      authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Lemon Squeezy answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** A hosted checkout URL for a plan, tagged with the account so the webhook knows whose plan to change. */
export async function checkoutUrl(
  env: Env,
  plan: string,
  accountId: string,
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const variant = variants(env)[plan];
  if (!variant || !PLANS[plan]) throw new Error(`No checkout for plan "${plan}".`);
  const res = await ls<{ data: { attributes: { url: string } } }>(
    env,
    "/checkouts",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { email, custom: { account_id: accountId } },
            product_options: { redirect_url: `${env.APP_URL}/app/settings?billing=done` },
          },
          relationships: {
            store: { data: { type: "stores", id: env.LEMONSQUEEZY_STORE_ID } },
            variant: { data: { type: "variants", id: variant } },
          },
        },
      }),
    },
    fetchImpl,
  );
  return res.data.attributes.url;
}

export async function portalUrl(env: Env, subscriptionId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await ls<{ data: { attributes: { urls: { customer_portal: string } } } }>(
    env,
    `/subscriptions/${subscriptionId}`,
    { method: "GET" },
    fetchImpl,
  );
  return res.data.attributes.urls.customer_portal;
}

export interface SubscriptionChange {
  accountId: string;
  plan: string;
  /** Lemon Squeezy's status: on_trial, active, paused, past_due, unpaid, cancelled, expired. */
  status: string;
  customerId: string;
  subscriptionId: string;
}

/**
 * Checks the X-Signature header and reads a subscription event. Returns null for events that don't change a plan.
 * Throws on a bad signature.
 */
export async function readWebhook(env: Env, rawBody: string, signature: string): Promise<SubscriptionChange | null> {
  if (!safeEqual(await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, rawBody), signature)) throw new Error("Bad signature.");
  const body = JSON.parse(rawBody) as {
    meta: { event_name: string; custom_data?: { account_id?: string } };
    data: { id: string; type: string; attributes: { status: string; variant_id: number; customer_id: number } };
  };
  if (!body.meta.event_name.startsWith("subscription_") || body.data.type !== "subscriptions") return null;
  const accountId = body.meta.custom_data?.account_id;
  const plan = planForVariant(env, body.data.attributes.variant_id);
  if (!accountId || !plan) return null;
  const status = body.data.attributes.status;
  // A subscription that has ended drops the account back to the trial limits.
  const ended = status === "expired" || status === "unpaid";
  return {
    accountId,
    plan: ended ? "trial" : plan,
    status: ended ? "active" : status === "cancelled" ? "active" : status,
    customerId: String(body.data.attributes.customer_id),
    subscriptionId: body.data.id,
  };
}
