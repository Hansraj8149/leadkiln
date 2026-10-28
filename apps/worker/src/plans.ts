// Plans by leads kept per month. Prices live in Lemon Squeezy; only the limits live here.

export interface Plan {
  id: string;
  name: string;
  leadsPerMonth: number;
  workspaces: number;
}

export const PLANS: Record<string, Plan> = {
  trial: { id: "trial", name: "Trial", leadsPerMonth: 60, workspaces: 1 },
  solo: { id: "solo", name: "Solo", leadsPerMonth: 600, workspaces: 1 },
  team: { id: "team", name: "Agency", leadsPerMonth: 3000, workspaces: 10 },
};

export const planFor = (id: string): Plan => PLANS[id] ?? PLANS.trial!;

export const month = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

/** How many more leads a run may keep this month, or why it can't run. */
export function allowance(plan: Plan, status: string, used: number): { left: number; reason?: string } {
  if (status !== "active" && status !== "on_trial")
    return { left: 0, reason: "The subscription isn't active. Update billing to continue." };
  const left = Math.max(0, plan.leadsPerMonth - used);
  return left ? { left } : { left: 0, reason: `This month's ${plan.leadsPerMonth} leads are used. Upgrade or wait.` };
}
