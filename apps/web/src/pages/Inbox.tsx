import { useState } from "react";
import { SOURCE_LABELS, STATUSES, type LeadStatus } from "@leadkiln/core";
import { ago, api, when, type Lead, type Run, type Workspace } from "../api";
import { Link } from "../router";
import { Badge, Button, Loading, Notice, useAction, useLoad } from "../ui";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  sent: "Sent",
  replied: "Replied",
  won: "Won",
  skipped: "Skipped",
};

export function InboxTab({ ws }: { ws: Workspace }) {
  const [status, setStatus] = useState<LeadStatus>("new");
  const [offer, setOffer] = useState("");
  const leads = useLoad(
    () =>
      api<{ leads: Lead[]; counts: Record<LeadStatus, number> }>(
        "GET",
        `/workspaces/${ws.id}/leads?status=${status}${offer ? `&offer=${encodeURIComponent(offer)}` : ""}`,
      ),
    [ws.id, status, offer],
  );
  const runs = useLoad(() => api<Run[]>("GET", `/workspaces/${ws.id}/runs`), [ws.id]);
  const action = useAction();
  const last = runs.data?.[0];
  const pending = last && (last.status === "queued" || last.status === "running");
  const offerLabel = (id: string) => ws.profile.offers.find((o) => o.id === id)?.label ?? id;

  const findNow = () =>
    action.run(async () => {
      await api("POST", `/workspaces/${ws.id}/runs`);
      await runs.reload();
      // A run takes a minute or two; check back for its result.
      const poll = setInterval(async () => {
        const r = await api<Run[]>("GET", `/workspaces/${ws.id}/runs`);
        runs.setData(r);
        if (r[0] && r[0].status !== "queued" && r[0].status !== "running") {
          clearInterval(poll);
          leads.reload();
        }
      }, 5000);
    });

  return (
    <>
      <div className="head">
        <p className="muted" style={{ maxWidth: 560 }}>
          {last ? (
            <>
              Last search {when(last.createdAt)}:{" "}
              {last.status === "done"
                ? `${last.added} new ${last.added === 1 ? "lead" : "leads"}.`
                : last.status === "failed"
                  ? `failed. ${last.error ?? ""}`
                  : "running now…"}
            </>
          ) : (
            "No search yet. The first runs at your daily hour, or start one now."
          )}
        </p>
        <div className="actions start" style={{ margin: 0 }}>
          <a className="btn" href={`/api/workspaces/${ws.id}/leads.csv`}>
            Export CSV
          </a>
          <Button kind="primary" onClick={findNow} disabled={action.busy || !!pending || ws.placeholders.length > 0}>
            {pending ? "Searching…" : "Find leads now"}
          </Button>
        </div>
      </div>
      {action.error && <Notice kind="error">{action.error}</Notice>}
      {leads.error && <Notice kind="error">{leads.error}</Notice>}

      <div className="tabs" role="tablist" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            className={status === s ? "on" : ""}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABELS[s]}
            <span className="count">{leads.data?.counts[s] ?? ""}</span>
          </button>
        ))}
      </div>
      {ws.profile.offers.length > 1 && (
        <label className="field" style={{ maxWidth: 320, marginBottom: 16 }}>
          <span>Offer</span>
          <select value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="">All offers</option>
            {ws.profile.offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {!leads.data ? (
        <Loading />
      ) : leads.data.leads.length === 0 ? (
        <div className="card empty">
          <h2>{status === "new" ? "Nothing new right now" : `No ${STATUS_LABELS[status].toLowerCase()} leads`}</h2>
          <p className="muted">
            {status === "new"
              ? "New leads land here every morning, best fit first. More sources on means more leads."
              : "Leads move here when you mark them on their page."}
          </p>
          {status === "new" && (
            <Link className="btn" href={`/app/w/${ws.id}/sources`}>
              Check your sources
            </Link>
          )}
        </div>
      ) : (
        <ul className="list">
          {leads.data.leads.map((l) => (
            <li key={l.id}>
              <Link href={`/app/leads/${l.id}`} className="row">
                <span className="score" aria-label={`Score ${l.score}`}>
                  {l.score}
                </span>
                <span className="row-main">
                  <span className="row-title">{l.title}</span>
                  <span className="row-meta">
                    <Badge>{offerLabel(l.offer)}</Badge>
                    <span>{SOURCE_LABELS[l.source]}</span>
                    <span>{ago(l.postedAt ?? l.foundAt)}</span>
                    {l.contact && <span>Contact left</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
