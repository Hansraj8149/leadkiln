import { useState, type ReactNode } from "react";
import { SOURCE_LABELS, type Source } from "@leadkiln/core";
import { api, when, type KeyName, type Run, type Workspace } from "../api";
import { Badge, Button, Check, LinesField, Notice, TextField, useAction, useLoad } from "../ui";

type Sources = Workspace["profile"]["sources"];

function KeyField({
  ws,
  name,
  label,
  help,
  onSaved,
}: {
  ws: Workspace;
  name: KeyName;
  label: string;
  help?: ReactNode;
  onSaved: (w: Workspace) => void;
}) {
  const [value, setValue] = useState("");
  const action = useAction();
  const set = (v: string | null) =>
    action.run(async () => {
      onSaved(await api<Workspace>("PUT", `/workspaces/${ws.id}/keys`, { [name]: v }));
      setValue("");
    });
  return (
    <div className="form" style={{ gap: 8 }}>
      <div className="inline" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <TextField
            label={label}
            type="password"
            value={value}
            onChange={setValue}
            placeholder={ws.keys[name] ? "Saved. Paste a new one to replace it." : ""}
            help={help}
          />
        </div>
        <Button disabled={!value || action.busy} onClick={() => set(value)}>
          Save
        </Button>
        {ws.keys[name] && (
          <Button kind="danger" disabled={action.busy} onClick={() => set(null)}>
            Remove
          </Button>
        )}
      </div>
      {action.error && <Notice kind="error">{action.error}</Notice>}
    </div>
  );
}

export function SourcesTab({ ws, onSaved }: { ws: Workspace; onSaved: (w: Workspace) => void }) {
  const [s, setS] = useState<Sources>(structuredClone(ws.profile.sources));
  const runs = useLoad(() => api<Run[]>("GET", `/workspaces/${ws.id}/runs`), [ws.id]);
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const offers = ws.profile.offers;

  const patch = <K extends keyof Sources>(key: K, value: Partial<Sources[K]>) =>
    setS((cur) => ({ ...cur, [key]: { ...cur[key], ...value } }));

  const save = () =>
    action.run(async () => {
      onSaved(await api<Workspace>("PUT", `/workspaces/${ws.id}/profile`, { ...ws.profile, sources: s }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });

  const last = runs.data?.find((r) => r.status === "done" || r.status === "failed");
  const health = (source: Source) => {
    const r = last?.sources.find((x) => x.source === source);
    if (!r) return null;
    if (r.error?.startsWith("skipped")) return <Badge tone="warn">{r.error.replace("skipped: ", "Needs: ")}</Badge>;
    if (r.error) return <Badge tone="bad">Failed: {r.error.slice(0, 60)}</Badge>;
    return (
      <Badge tone="ok">
        {r.found} found, {r.kept} kept
      </Badge>
    );
  };

  const OfferPick = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => (
    <label className="field">
      <span>Offer when nothing else matches</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">None (skip the post)</option>
        {offers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  const card = (source: Source, enabled: boolean, toggle: (v: boolean) => void, help: string, body?: ReactNode) => (
    <section className="card form" key={source}>
      <div className="source-head">
        <Check label={SOURCE_LABELS[source]} help={help} checked={enabled} onChange={toggle} />
        {health(source)}
      </div>
      {enabled && body}
    </section>
  );

  return (
    <>
      <p className="muted">
        Public sources only, each read the way its owner allows. Turn on the ones where your clients ask for help.
        {last && <> Health below is from the search on {when(last.createdAt)}.</>}
      </p>

      {card(
        "hn-hiring",
        s.hnHiring.enabled,
        (v) => patch("hnHiring", { enabled: v }),
        "Contract and freelance posts in the monthly Hacker News hiring thread that name one of your offers or tools.",
      )}
      {card(
        "remoteok",
        s.remoteok.enabled,
        (v) => patch("remoteok", { enabled: v }),
        "Contract and part-time remote roles from the last three days that name one of your offers or tools.",
      )}
      {card(
        "hn-show",
        s.hnShow.enabled,
        (v) => patch("hnShow", { enabled: v }),
        "New Show HN launches whose text or link contains one of your phrases.",
        <>
          <LinesField
            label="Phrases to look for"
            value={s.hnShow.match ?? []}
            onChange={(v) => patch("hnShow", { match: v })}
            help="One per line, e.g. lovable.app or non-technical founder."
          />
          <OfferPick value={s.hnShow.offer} onChange={(v) => patch("hnShow", { offer: v || undefined })} />
        </>,
      )}
      {card(
        "reddit",
        s.reddit.enabled,
        (v) => patch("reddit", { enabled: v }),
        "New posts asking for help or someone to hire. In r/forhire, only [Hiring] posts.",
        <>
          <LinesField
            label="Subreddits"
            value={s.reddit.subreddits ?? []}
            onChange={(v) => patch("reddit", { subreddits: v.map((x) => x.replace(/^\/?r\//, "")) })}
            help="One per line, without r/."
          />
          <KeyField
            ws={ws}
            name="redditClientId"
            label="Reddit app id"
            onSaved={onSaved}
            help={
              <>
                Create a "script" app at{" "}
                <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noreferrer">
                  reddit.com/prefs/apps
                </a>
                . Reddit refuses requests from cloud servers without one.
              </>
            }
          />
          <KeyField ws={ws} name="redditClientSecret" label="Reddit app secret" onSaved={onSaved} />
        </>,
      )}
      {card(
        "producthunt",
        s.producthunt.enabled,
        (v) => patch("producthunt", { enabled: v }),
        "Launches from the last two days that mention one of your phrases.",
        <>
          <LinesField
            label="Phrases to look for"
            value={s.producthunt.match ?? []}
            onChange={(v) => patch("producthunt", { match: v })}
          />
          <OfferPick value={s.producthunt.offer} onChange={(v) => patch("producthunt", { offer: v || undefined })} />
          <KeyField
            ws={ws}
            name="productHuntToken"
            label="Product Hunt developer token"
            onSaved={onSaved}
            help={
              <>
                From{" "}
                <a href="https://www.producthunt.com/v2/oauth/applications" target="_blank" rel="noreferrer">
                  producthunt.com/v2/oauth/applications
                </a>
                .
              </>
            }
          />
        </>,
      )}
      {card(
        "places",
        s.places.enabled,
        (v) => patch("places", { enabled: v }),
        "Local businesses on Google Maps with no website, or one that's broken or thin.",
        <>
          <div className="grid2">
            <LinesField
              label="Trades"
              value={s.places.trades ?? []}
              onChange={(v) => patch("places", { trades: v })}
              help="One per line, e.g. dentist, plumber."
            />
            <LinesField
              label="Cities"
              value={(s.places.cities ?? []).map((c) => `${c.name} | ${c.country}`)}
              onChange={(v) =>
                patch("places", {
                  cities: v.map((line) => {
                    const [name, country] = line.split("|").map((x) => x.trim());
                    return { name: name ?? "", country: (country ?? "").toUpperCase() };
                  }),
                })
              }
              help="One per line as City | country code, e.g. Leeds | GB."
            />
          </div>
          <div className="grid2">
            <TextField
              label="Searches per day"
              type="number"
              value={String(s.places.perRun ?? 5)}
              onChange={(v) => patch("places", { perRun: Number(v) || 1 })}
              help="Each is one trade in one city. Google bills each search to your key."
            />
            <TextField
              label="Fewest reviews"
              type="number"
              value={String(s.places.minReviews ?? 15)}
              onChange={(v) => patch("places", { minReviews: Number(v) || 0 })}
              help="Skips businesses too new or too quiet to buy."
            />
          </div>
          <OfferPick value={s.places.offer} onChange={(v) => patch("places", { offer: v || undefined })} />
          <KeyField
            ws={ws}
            name="googlePlacesKey"
            label="Google Places API key"
            onSaved={onSaved}
            help="Places API (New), with billing on in Google Cloud."
          />
        </>,
      )}
      {card(
        "rss",
        s.rss.enabled,
        (v) => patch("rss", { enabled: v }),
        "Any RSS or Atom feed: a job board, a forum tag, a saved search. Items from the last week.",
        <LinesField
          label="Feeds"
          rows={5}
          value={(s.rss.feeds ?? []).map((f) => `${f.label} | ${f.url}`)}
          onChange={(v) =>
            patch("rss", {
              feeds: v.map((line) => {
                const [label, url] = line.includes("|") ? line.split("|").map((x) => x.trim()) : ["Feed", line.trim()];
                return { label: label ?? "Feed", url: url ?? "" };
              }),
            })
          }
          help="One per line as Name | https://address-of-the-feed."
        />,
      )}

      {action.error && <Notice kind="error">{action.error}</Notice>}
      <div className="actions sticky">
        {saved && (
          <span className="muted" role="status">
            Saved.
          </span>
        )}
        <Button kind="primary" disabled={action.busy} onClick={save}>
          Save sources
        </Button>
      </div>
    </>
  );
}
