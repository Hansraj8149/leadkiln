import { api, type Workspace } from "../api";
import { Link } from "../router";
import { Loading, Notice, useLoad } from "../ui";
import { InboxTab } from "./Inbox";
import { ProfileTab } from "./Profile";
import { SettingsTab } from "./Settings";
import { SourcesTab } from "./Sources";

const TABS = [
  ["inbox", "Inbox"],
  ["sources", "Sources"],
  ["profile", "Profile"],
  ["settings", "Settings"],
] as const;

export function WorkspacePage({ id, tab }: { id: string; tab: string }) {
  const ws = useLoad(() => api<Workspace>("GET", `/workspaces/${id}`), [id]);
  if (ws.error) return <Notice kind="error">{ws.error}</Notice>;
  if (!ws.data) return <Loading />;
  const w = ws.data;
  const save = (next: Workspace) => ws.setData(next);

  return (
    <>
      <Link className="crumb" href="/app">
        ← Workspaces
      </Link>
      <h1>{w.profile.name}</h1>
      <nav className="tabs" aria-label="Workspace">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "inbox" ? `/app/w/${id}` : `/app/w/${id}/${key}`}
            className={tab === key ? "on" : ""}
            aria-current={tab === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {w.placeholders.length > 0 && tab !== "profile" && (
        <Notice kind="warn">
          Your profile still has example text in square brackets. Searches start once it's replaced.{" "}
          <Link href={`/app/w/${id}/profile`}>Finish the profile</Link>
        </Notice>
      )}
      {tab === "inbox" && <InboxTab ws={w} />}
      {tab === "sources" && <SourcesTab ws={w} onSaved={save} />}
      {tab === "profile" && <ProfileTab ws={w} onSaved={save} />}
      {tab === "settings" && <SettingsTab ws={w} onSaved={save} />}
      {!TABS.some(([k]) => k === tab) && <Notice>That tab doesn't exist.</Notice>}
    </>
  );
}
