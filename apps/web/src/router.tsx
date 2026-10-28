import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

// A small history-API router: the dashboard has a handful of routes, all under /app.

const listeners = new Set<() => void>();

export function navigate(to: string) {
  history.pushState(null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function usePath(): { path: string; query: URLSearchParams } {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    listeners.add(on);
    window.addEventListener("popstate", on);
    return () => {
      listeners.delete(on);
      window.removeEventListener("popstate", on);
    };
  }, []);
  return { path: location.pathname.replace(/\/+$/, "") || "/", query: new URLSearchParams(location.search) };
}

/** Matches "/app/sites/:id" against a path and returns the params, or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/");
  const a = path.split("/");
  if (p.length !== a.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) out[p[i]!.slice(1)] = decodeURIComponent(a[i]!);
    else if (p[i] !== a[i]) return null;
  }
  return out;
}

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(props.href);
  };
  return <a {...props} onClick={onClick} />;
}
