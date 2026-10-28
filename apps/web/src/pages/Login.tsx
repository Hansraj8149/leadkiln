import { useState } from "react";
import { PRODUCT } from "@leadkiln/core";
import { api } from "../api";
import { usePath } from "../router";
import { Button, Logo, Notice, TextField, useAction } from "../ui";

export function LoginPage() {
  const { query } = usePath();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const action = useAction();

  return (
    <main className="page narrow">
      <a className="brand" href="/">
        <Logo />
        {PRODUCT.name}
      </a>
      <div className="card" style={{ marginTop: 24 }}>
        {sent ? (
          <>
            <h1>Check your inbox</h1>
            <p className="muted">
              A sign-in link is on its way to <strong>{email}</strong>. It works once and expires in 15 minutes.
            </p>
            <Button onClick={() => setSent(false)}>Use another email</Button>
          </>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await action.run(() => api("POST", "/auth/start", { email }))) setSent(true);
            }}
          >
            <div>
              <h1>Sign in</h1>
              <p className="muted">We'll email you a link. New here? The same link creates your account.</p>
            </div>
            {query.get("error") && <Notice kind="error">{query.get("error")}</Notice>}
            <TextField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            {action.error && <Notice kind="error">{action.error}</Notice>}
            <Button kind="primary" type="submit" className="block" disabled={action.busy || !email}>
              {action.busy ? "Sending…" : "Email me a link"}
            </Button>
          </form>
        )}
      </div>
      <p className="muted small">60 free leads a month to start. No card needed.</p>
    </main>
  );
}
