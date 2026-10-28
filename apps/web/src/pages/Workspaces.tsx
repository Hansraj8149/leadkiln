import { useState } from "react";
import { api, when, type WorkspaceSummary } from "../api";
import { Link, navigate } from "../router";
import { Badge, Button, Loading, Notice, TextField, useAction, useLoad } from "../ui";

export function WorkspacesPage() {
  const list = useLoad(() => api<WorkspaceSummary[]>("GET", "/workspaces"));
  const [name, setName] = useState("");
  const action = useAction();

  const create = () =>
    action.run(async () => {
      const { id } = await api<{ id: string }>("POST", "/workspaces", { name });
      navigate(`/app/w/${id}/profile`);
    });

  return (
    <>
      <h1>Workspaces</h1>
      <p className="muted">
        One workspace per business you find clients for. Each has its own offers, sources and morning digest.
      </p>
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {!list.data ? (
        <Loading />
      ) : (
        list.data.length > 0 && (
          <ul className="list" style={{ marginBottom: 24 }}>
            {list.data.map((w) => (
              <li key={w.id}>
                <Link href={`/app/w/${w.id}`} className="row">
                  <span className="row-main">
                    <span className="row-title">{w.name}</span>
                    <span className="row-meta">{w.paused ? "Paused" : `Next search ${when(w.nextRunAt)}`}</span>
                  </span>
                  {w.newLeads > 0 && <Badge tone="accent">{w.newLeads} new</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h2>{list.data?.length ? "Add a workspace" : "Start with your business"}</h2>
        <p className="muted">
          You'll describe what you sell and the work you can point to. Every message is built from your own words.
        </p>
        <TextField label="Business name" value={name} onChange={setName} placeholder="Acme Studio" />
        {action.error && <Notice kind="error">{action.error}</Notice>}
        <div className="actions start">
          <Button kind="primary" type="submit" disabled={action.busy || !name.trim()}>
            Create workspace
          </Button>
        </div>
      </form>
    </>
  );
}
