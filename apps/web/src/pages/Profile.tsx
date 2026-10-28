import { useState } from "react";
import { api, type Workspace } from "../api";
import { Button, LinesField, Notice, TextField, useAction } from "../ui";

type Profile = Workspace["profile"];
type Offer = Profile["offers"][number];
type Proof = NonNullable<Profile["proof"]>[number];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "item";

export function ProfileTab({ ws, onSaved }: { ws: Workspace; onSaved: (w: Workspace) => void }) {
  const [p, setP] = useState<Profile>(structuredClone(ws.profile));
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const set = (fields: Partial<Profile>) => setP((cur) => ({ ...cur, ...fields }));
  const proof = p.proof ?? [];

  const setOffer = (i: number, fields: Partial<Offer>) =>
    set({ offers: p.offers.map((o, j) => (j === i ? { ...o, ...fields } : o)) });
  const setProof = (i: number, fields: Partial<Proof>) =>
    set({ proof: proof.map((o, j) => (j === i ? { ...o, ...fields } : o)) });

  const save = () =>
    action.run(async () => {
      onSaved(await api<Workspace>("PUT", `/workspaces/${ws.id}/profile`, p));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });

  return (
    <div className="form">
      {ws.placeholders.length > 0 && (
        <Notice kind="warn">
          Replace the example text in square brackets. Searches start once none is left:
          <ul>
            {ws.placeholders.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Notice>
      )}

      <section className="card form">
        <h2>Who you are</h2>
        <p className="muted">
          Every message is built from these words and the proof below. Nothing else is said about you, so write only
          what you can stand behind.
        </p>
        <div className="grid2">
          <TextField label="Business name" value={p.name} onChange={(v) => set({ name: v })} />
          <TextField label="Website" value={p.website} onChange={(v) => set({ website: v })} placeholder="https://" />
        </div>
        <TextField
          label="Sign-off name"
          value={p.sender}
          onChange={(v) => set({ sender: v })}
          help="Your first name, at the end of each message."
        />
        <TextField
          label="Introduction"
          multiline
          rows={3}
          value={p.intro}
          onChange={(v) => set({ intro: v })}
          help="One or two sentences in your voice. Opens the second paragraph of every message."
        />
        <div className="grid2">
          <TextField
            label="Closing line for posts"
            multiline
            rows={2}
            value={p.ask ?? ""}
            onChange={(v) => set({ ask: v })}
          />
          <TextField
            label="Closing line for job ads"
            multiline
            rows={2}
            value={p.jobAsk ?? ""}
            onChange={(v) => set({ jobAsk: v })}
          />
        </div>
      </section>

      <section className="card form">
        <h2>What you sell</h2>
        <p className="muted">A post that uses one of an offer's words is matched to that offer.</p>
        {p.offers.map((o, i) => (
          <div className="repeat" key={i}>
            <div className="grid2">
              <TextField
                label="Name in a message"
                value={o.label}
                onChange={(v) => setOffer(i, { label: v, id: o.id || slug(v) })}
                help={'Reads after "your post about", e.g. "a website".'}
              />
              <TextField
                label="Your page about it"
                value={o.link ?? ""}
                onChange={(v) => setOffer(i, { link: v || undefined })}
                placeholder="https://"
              />
            </div>
            <LinesField
              label="Words that show a post needs it"
              value={o.keywords}
              onChange={(v) => setOffer(i, { keywords: v })}
            />
            {p.offers.length > 1 && (
              <div className="actions" style={{ margin: 0 }}>
                <Button kind="danger" onClick={() => set({ offers: p.offers.filter((_, j) => j !== i) })}>
                  Remove offer
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className="actions start" style={{ margin: 0 }}>
          <Button
            onClick={() =>
              set({ offers: [...p.offers, { id: `offer-${p.offers.length + 1}`, label: "", keywords: [] }] })
            }
          >
            Add an offer
          </Button>
        </div>
      </section>

      <section className="card form">
        <h2>Proof</h2>
        <p className="muted">
          Work you've shipped, one sentence each. A message quotes the one that fits the lead best, word for word.
        </p>
        {proof.map((x, i) => (
          <div className="repeat" key={i}>
            <TextField
              label="What you'd say"
              multiline
              rows={2}
              value={x.text}
              onChange={(v) => setProof(i, { text: v })}
            />
            <TextField
              label="What it shows"
              value={x.about}
              onChange={(v) => setProof(i, { about: v, id: x.id || slug(v) })}
              help="A few words, used only to pick the right proof. Never sent."
            />
            <fieldset>
              <legend>Fits these offers</legend>
              {p.offers.map((o) => (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={(x.offers ?? []).includes(o.id)}
                    onChange={(e) =>
                      setProof(i, {
                        offers: e.target.checked
                          ? [...(x.offers ?? []), o.id]
                          : (x.offers ?? []).filter((id) => id !== o.id),
                      })
                    }
                  />
                  <span>{o.label || o.id}</span>
                </label>
              ))}
            </fieldset>
            <div className="actions" style={{ margin: 0 }}>
              <Button kind="danger" onClick={() => set({ proof: proof.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div className="actions start" style={{ margin: 0 }}>
          <Button
            onClick={() =>
              set({ proof: [...proof, { id: `proof-${proof.length + 1}`, text: "", about: "", offers: [] }] })
            }
          >
            Add proof
          </Button>
        </div>
      </section>

      <section className="card form">
        <h2>Fit</h2>
        <div className="grid2">
          <LinesField
            label="Tools you work with"
            value={p.stack ?? []}
            onChange={(v) => set({ stack: v })}
            help="A post naming one scores higher."
          />
          <LinesField
            label="Markets you want"
            value={p.markets ?? []}
            onChange={(v) => set({ markets: v.map((x) => x.toUpperCase()) })}
            help="Two-letter country codes, one per line (US, GB, DE)."
          />
        </div>
        <LinesField
          label="Skip posts that say"
          value={p.exclude ?? []}
          onChange={(v) => set({ exclude: v })}
          help="One phrase per line, e.g. onsite only. Unpaid and equity-only work is always skipped."
        />
        <div className="grid2">
          <TextField
            label="Lowest score to keep"
            type="number"
            value={String(p.minScore ?? 50)}
            onChange={(v) => set({ minScore: Number(v) })}
            help="Scores start at 30. 50 keeps posts that ask for what you sell and show one more good sign."
          />
          <TextField
            label="Most leads per day"
            type="number"
            value={String(p.maxPerRun ?? 15)}
            onChange={(v) => set({ maxPerRun: Number(v) })}
          />
        </div>
      </section>

      {action.error && <Notice kind="error">{action.error}</Notice>}
      <div className="actions sticky">
        {saved && (
          <span className="muted" role="status">
            Saved.
          </span>
        )}
        <Button kind="primary" disabled={action.busy} onClick={save}>
          Save profile
        </Button>
      </div>
    </div>
  );
}
