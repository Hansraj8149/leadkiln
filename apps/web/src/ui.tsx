import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Loads data on mount and on demand; keeps the last good value while reloading. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => load().then(setData, (e: Error) => setError(e.message)), deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload, setData };
}

/** Runs an action, shows its error, and blocks double clicks while it runs. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function Button({
  kind = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "danger" }) {
  return <button type="button" {...props} className={`btn ${kind} ${props.className ?? ""}`} />;
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: ReactNode;
  type?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea
          className={props.className}
          value={props.value}
          rows={props.rows ?? 3}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          type={props.type ?? "text"}
          value={props.value}
          placeholder={props.placeholder}
          autoComplete={props.type === "password" ? "off" : undefined}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.help && <small>{props.help}</small>}
    </label>
  );
}

const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/** A list of short phrases edited one per line. */
export function LinesField(props: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  help?: ReactNode;
  rows?: number;
  placeholder?: string;
}) {
  const joined = props.value.join("\n");
  const [text, setText] = useState(joined);
  // Resync only when the value changes from outside, so typing a blank line isn't undone.
  useEffect(() => {
    if (lines(text).join("\n") !== joined) setText(joined);
  }, [joined]);
  return (
    <TextField
      label={props.label}
      multiline
      rows={props.rows ?? 4}
      value={text}
      placeholder={props.placeholder}
      help={props.help ?? "One per line."}
      onChange={(v) => {
        setText(v);
        props.onChange(lines(v));
      }}
    />
  );
}

export function Check(props: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>
        <strong>{props.label}</strong>
        {props.help && <em>{props.help}</em>}
      </span>
    </label>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok" | "warn"; children: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "ok" | "warn" | "bad" | "accent";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export const Loading = () => <p className="muted">Loading…</p>;

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="14.5" cy="14.5" r="6" fill="none" stroke="var(--accent-fg)" strokeWidth="2.4" />
      <path d="m19 19 5 5" stroke="var(--accent-fg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14.5" cy="14.5" r="2" fill="var(--accent-fg)" />
    </svg>
  );
}
