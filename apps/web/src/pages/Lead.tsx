import { useEffect, useState } from "react";
import { SOURCE_LABELS, STATUSES } from "@leadkiln/core";
import { ago, api, type Lead } from "../api";
import { Link } from "../router";
import { Badge, Button, Loading, Notice, TextField, useAction, useLoad } from "../ui";
import { STATUS_LABELS } from "./Inbox";

export function LeadPage({ id }: { id: string }) {
  const lead = useLoad(() => api<Lead>("GET", `/leads/${id}`), [id]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (lead.data) {
      setDraft(lead.data.draft);
      setNote(lead.data.note);
    }
  }, [lead.data?.id]);

  if (lead.error) return <Notice kind="error">{lead.error}</Notice>;
  if (!lead.data) return <Loading />;
  const l = lead.data;
  const dirty = draft !== l.draft || note !== l.note;

  const save = (fields: Partial<Pick<Lead, "status" | "draft" | "note">>) =>
    action.run(async () => lead.setData(await api<Lead>("PUT", `/leads/${l.id}`, fields)));

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Link className="crumb" href={`/app/w/${l.workspaceId}`}>
        ← Inbox
      </Link>
      <div className="head">
        <h1 className="lead-title">{l.title}</h1>
      </div>
      <p className="row-meta" style={{ marginBottom: 16 }}>
        <Badge tone="accent">Score {l.score}</Badge>
        <span>{SOURCE_LABELS[l.source]}</span>
        {l.author && <span>{l.author}</span>}
        <span>{ago(l.postedAt ?? l.foundAt)}</span>
        {l.country && <span>{l.country}</span>}
      </p>
      {action.error && <Notice kind="error">{action.error}</Notice>}

      <div className="lead-grid">
        <section className="card form">
          <TextField
            label="Your first message"
            multiline
            rows={14}
            className="draft"
            value={draft}
            onChange={setDraft}
          />
          <p className="muted small" style={{ margin: 0 }}>
            {PRODUCT_NOTE}
          </p>
          <div className="actions">
            {dirty && (
              <Button disabled={action.busy} onClick={() => save({ draft, note })}>
                Save changes
              </Button>
            )}
            <Button onClick={copy}>{copied ? "Copied" : "Copy message"}</Button>
            <a className="btn primary" href={l.url} target="_blank" rel="noopener noreferrer">
              Open the post
            </a>
          </div>
        </section>

        <div>
          <section className="card">
            <h2>Where it stands</h2>
            <div className="status-row" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  className={l.status === s ? "on" : ""}
                  aria-pressed={l.status === s}
                  disabled={action.busy}
                  onClick={() => save({ status: s, draft, note })}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <TextField
                label="Note"
                multiline
                rows={3}
                value={note}
                onChange={setNote}
                placeholder="Replied on LinkedIn…"
              />
            </div>
          </section>

          <section className="card">
            <h2>Why it scored {l.score}</h2>
            <ul className="points">
              {l.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {l.facts.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Their homepage</h3>
                <ul className="points">
                  {l.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </>
            )}
            {(l.contact || l.siteUrl) && (
              <>
                <h3 style={{ marginTop: 14 }}>Reach them</h3>
                {l.contact && <p style={{ overflowWrap: "anywhere" }}>{l.contact}</p>}
                {l.siteUrl && (
                  <p style={{ overflowWrap: "anywhere" }}>
                    <a href={l.siteUrl} target="_blank" rel="noopener noreferrer">
                      {l.siteUrl}
                    </a>
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {l.body && (
        <section className="card">
          <h2>What they wrote</h2>
          <div className="post">{l.body}</div>
        </section>
      )}
    </>
  );
}

const PRODUCT_NOTE =
  "Nothing is sent for you. Read it, make it yours, send it where they posted, then mark it Sent so it leaves your inbox.";
