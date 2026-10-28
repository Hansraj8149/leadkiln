import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PRODUCT } from "@leadkiln/core";
import { api, ApiError, type Me } from "./api";
import { AccountPage } from "./pages/Account";
import { LeadPage } from "./pages/Lead";
import { LoginPage } from "./pages/Login";
import { WorkspacePage } from "./pages/Workspace";
import { WorkspacesPage } from "./pages/Workspaces";
import { Link, match, navigate, usePath } from "./router";
import "./styles.css";
import { Loading, Logo, Notice, useLoad } from "./ui";

function App() {
  const { path } = usePath();
  const me = useLoad<Me | "signed-out">(
    () =>
      api<Me>("GET", "/me").catch((e) =>
        e instanceof ApiError && e.status === 401 ? "signed-out" : Promise.reject(e),
      ),
    [],
  );
  // Usage in the header changes after a search; refresh it on every page change.
  useEffect(() => {
    if (me.data && me.data !== "signed-out") me.reload();
  }, [path]);

  const onLogin = path === "/app/login";
  useEffect(() => {
    if (me.data === "signed-out" && !onLogin) navigate("/app/login");
  }, [me.data, onLogin]);

  if (onLogin) return <LoginPage />;
  if (me.error) return <Notice kind="error">{me.error}</Notice>;
  if (!me.data || me.data === "signed-out") return <Loading />;

  let page;
  let m;
  if (path === "/app") page = <WorkspacesPage />;
  else if ((m = match("/app/w/:id", path))) page = <WorkspacePage id={m.id!} tab="inbox" />;
  else if ((m = match("/app/w/:id/:tab", path))) page = <WorkspacePage id={m.id!} tab={m.tab!} />;
  else if ((m = match("/app/leads/:id", path))) page = <LeadPage id={m.id!} />;
  else if (path === "/app/account") page = <AccountPage me={me.data} />;
  else
    page = (
      <Notice>
        That page doesn't exist. <Link href="/app">Go to your workspaces</Link>.
      </Notice>
    );

  return (
    <>
      <header className="bar">
        <Link className="brand" href="/app">
          <Logo />
          {PRODUCT.name}
        </Link>
        <nav aria-label="Main">
          <Link href="/app">Workspaces</Link>
          <Link href="/app/account">
            {me.data.plan.name} · {me.data.usage.leads}/{me.data.plan.leadsPerMonth} leads
          </Link>
        </nav>
      </header>
      <main className="page">{page}</main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
