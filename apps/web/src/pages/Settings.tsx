import { useState } from "react";
import { api, when, type Workspace } from "../api";
import { navigate } from "../router";
import { Button, Check, Notice, TextField, useAction } from "../ui";

export function SettingsTab({ ws, onSaved }: { ws: Workspace; onSaved: (w: Workspace) => void }) {
  const [digestEmail, setDigestEmail] = useState(ws.digestEmail ?? "");
  const [webhookUrl, setWebhookUrl] = useState(ws.webhookUrl ?? "");
  const [runHour, setRunHour] = useState(ws.runHour);
  const [paused, setPaused] = useState(ws.paused);
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const local = (h: number) => {
    const d = new Date();
    d.setUTCHours(h, 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="form">
      <section className="card form">
        <h2>Daily search</h2>
        <label className="field">
          <span>Search at</span>
          <select value={runHour} onChange={(e) => setRunHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {local(h)} your time ({String(h).padStart(2, "0")}:00 UTC)
              </option>
            ))}
          </select>
        </label>
        <Check label="Pause daily searches" help="Find leads now still works." checked={paused} onChange={setPaused} />
        {!ws.paused && <p className="muted small">Next search: {when(ws.nextRunAt)}.</p>}
      </section>

      <section className="card form">
        <h2>Where new leads go</h2>
        <TextField
          label="Digest email"
          type="email"
          value={digestEmail}
          onChange={setDigestEmail}
          help="The best ten leads of each search, with their drafts. Leave empty for none."
        />
        <TextField
          label="Webhook"
          value={webhookUrl}
          onChange={setWebhookUrl}
          placeholder="https://hooks.slack.com/services/…"
          help="A Slack or Discord incoming webhook, or your own endpoint: it gets the leads as JSON."
        />
      </section>

      {action.error && <Notice kind="error">{action.error}</Notice>}
      <div className="actions">
        {saved && (
          <span className="muted" role="status">
            Saved.
          </span>
        )}
        <Button
          kind="primary"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              onSaved(
                await api<Workspace>("PUT", `/workspaces/${ws.id}/settings`, {
                  digestEmail,
                  webhookUrl,
                  runHour,
                  paused,
                }),
              );
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            })
          }
        >
          Save settings
        </Button>
      </div>

      <section className="card form">
        <h2>Delete this workspace</h2>
        <p className="muted">Removes its profile, keys and every lead. This can't be undone.</p>
        <div className="actions start" style={{ margin: 0 }}>
          <Button
            kind="danger"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                if (!window.confirm(`Delete ${ws.profile.name} and all its leads?`)) return;
                await api("DELETE", `/workspaces/${ws.id}`);
                navigate("/app");
              })
            }
          >
            Delete workspace
          </Button>
        </div>
      </section>
    </div>
  );
}
