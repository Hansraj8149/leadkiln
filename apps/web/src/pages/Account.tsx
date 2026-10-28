import { api, type Me } from "../api";
import { usePath } from "../router";
import { Button, Notice, useAction } from "../ui";

export function AccountPage({ me }: { me: Me }) {
  const { query } = usePath();
  const action = useAction();

  const go = (path: string, method = "GET", body?: unknown) =>
    action.run(async () => {
      const { url } = await api<{ url: string }>(method, path, body);
      location.href = url;
    });

  return (
    <>
      <h1>Account</h1>
      {query.get("billing") === "done" && (
        <Notice kind="ok">
          Thanks. Your plan updates as soon as the payment is confirmed, usually within a minute.
        </Notice>
      )}
      {action.error && <Notice kind="error">{action.error}</Notice>}

      <section className="card">
        <h2>Plan</h2>
        <p>
          <strong>{me.plan.name}</strong>: {me.usage.leads} of {me.plan.leadsPerMonth} leads kept in {me.usage.month},{" "}
          {me.plan.workspaces} workspace{me.plan.workspaces === 1 ? "" : "s"}.
          {me.planStatus !== "active" && <> Status: {me.planStatus}.</>}
        </p>
        {me.hasSubscription ? (
          <Button disabled={action.busy} onClick={() => go("/billing/portal")}>
            Change plan, card or invoices
          </Button>
        ) : (
          <div className="plans">
            {me.plans.map((p) => (
              <div key={p.id} className="plan">
                <strong>{p.name}</strong>
                <p className="muted small">
                  {p.leadsPerMonth} leads a month, {p.workspaces} workspace{p.workspaces === 1 ? "" : "s"}
                </p>
                <Button
                  kind="primary"
                  disabled={action.busy}
                  onClick={() => go("/billing/checkout", "POST", { plan: p.id })}
                >
                  Choose {p.name}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Signed in</h2>
        <p>{me.email}</p>
        <Button
          onClick={() =>
            action.run(async () => {
              await api("POST", "/auth/logout");
              location.href = "/app/login";
            })
          }
        >
          Sign out
        </Button>
      </section>
    </>
  );
}
