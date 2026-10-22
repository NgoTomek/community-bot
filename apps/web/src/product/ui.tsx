import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { copyText } from "./clipboard";
import { usePresent } from "./session";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title === "Community Bots" ? title : `${title} · Community Bots`;
    return () => {
      document.title = "Community Bots";
    };
  }, [title]);
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="banner" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty stack">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="stack" role="status">
      <p>{label}</p>
      <div className="clipping sk" />
    </div>
  );
}

export function SetupNotice() {
  return (
    <EmptyState title="This noticeboard is not connected">
      <p>
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the repo-root{" "}
        <code>.env</code>, then restart <code>npm run dev</code>. This page uses the anon key only.
      </p>
    </EmptyState>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <span className="badge moss">confirmed</span>;
  if (status === "draft") return <span className="badge amber">draft from public info</span>;
  return <span className="badge">{status}</span>;
}

export function ApprovalChip({ status }: { status: string }) {
  const tone = status === "approved" ? "moss" : status === "declined" ? "signal" : "amber";
  return <span className={`badge ${tone}`}>{status}</span>;
}

export function SampleStamp() {
  return <p className="stamp">Sample data, not a real Bot run</p>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={() => {
        void copyText(text).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 1600);
        });
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn’t copy" : label}
    </button>
  );
}

export function SafeLink({ href }: { href: string }) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a className="break" href={href} target="_blank" rel="noreferrer">
        {href}
      </a>
    );
  }
  return <span className="break">{href}</span>;
}

export function Payload({ text }: { text: string }) {
  return (
    <div className="stack">
      <pre className="payload">{text}</pre>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

export function QrBlock({ value, caption }: { value: string; caption: string }) {
  const present = usePresent();
  return (
    <figure className="qr-block stack">
      <QRCodeSVG value={value} size={present ? 232 : 168} bgColor="#fffaf3" fgColor="#1c1915" level="M" />
      <figcaption className="kicker">{caption}</figcaption>
      <code className="break">{value}</code>
      <CopyButton text={value} label="Copy link" />
    </figure>
  );
}
