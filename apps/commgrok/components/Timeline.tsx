import { Ban, Bot, Check, CircleDot, Pencil, Rocket, Send, Undo2, XCircle, type LucideIcon } from "lucide-react";
import { DEFAULT_TZ, relativeTime, shortDate, timeOf } from "@/lib/time";
import type { LogEntry } from "@/lib/types";
import { cx } from "./ui";

type Change = { from: unknown; to: unknown };
type Row = {
  icon: LucideIcon;
  tone: string;
  /** null = sentence already names the actor. */
  actor: string | null;
  text: string;
  quote?: string | null;
  changes?: [string, Change][];
  afterNote?: string | null;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Human-readable value for the diff list: dates in Europe/London, arrays joined, null as "—". */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? clip(v.map((x) => fmtValue(x)).join(", ")) : "—";
  if (typeof v === "string") {
    if (ISO_RE.test(v) && !Number.isNaN(Date.parse(v))) return `${shortDate(v, DEFAULT_TZ)}, ${timeOf(v, DEFAULT_TZ)}`;
    return clip(v.replace(/\s+/g, " ").trim());
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return clip(o.name);
    return clip(JSON.stringify(v));
  }
  return clip(String(v));
}

const isBot = (actor: string) => /bot/i.test(actor);

function describe(l: LogEntry): Row {
  const p = (l.payload ?? {}) as Record<string, unknown>;
  const note = typeof p.note === "string" && p.note.trim() ? p.note.trim() : null;
  switch (l.action) {
    case "proposed":
      return { icon: isBot(l.actor) ? Bot : CircleDot, tone: "bg-accent-soft text-accent-text", actor: l.actor, text: "proposed this event" };
    case "approved":
      return { icon: Check, tone: "bg-ok-soft text-ok", actor: l.actor, text: "accepted" };
    case "rejected":
      return { icon: XCircle, tone: "bg-bad-soft text-bad", actor: l.actor, text: note ? "rejected:" : "rejected", quote: note };
    case "renegotiate":
    case "changes_requested":
      return { icon: Undo2, tone: "bg-warn-soft text-warn", actor: l.actor, text: "sent back to bots:", quote: note ?? "no note" };
    case "revised":
    case "edited": {
      const changes = p.changes && typeof p.changes === "object" ? (Object.entries(p.changes as Record<string, Change>) as [string, Change][]) : [];
      const rev = typeof p.revision === "number" ? ` · v${p.revision}` : "";
      const fields = Array.isArray(p.fields) ? (p.fields as string[]) : [];
      const bot = l.action === "revised" && isBot(l.actor);
      const verb = l.action === "revised" ? (bot ? "Revised by bot" : `Revised by ${l.actor}`) : `Edited by ${l.actor}`;
      return {
        icon: bot ? Bot : Pencil,
        tone: "bg-accent-soft text-accent-text",
        actor: null,
        text: `${verb}${rev}${!changes.length && fields.length ? `: ${fields.join(", ")}` : ""}`,
        changes,
        afterNote: note,
      };
    }
    case "published":
      return { icon: Rocket, tone: "bg-ok-soft text-ok", actor: null, text: "Published to the calendar" };
    case "webhook": {
      const type = typeof p.type === "string" ? p.type.replace(/^event\./, "") : "update";
      return { icon: Send, tone: "bg-subtle text-muted", actor: null, text: `Bots notified: ${type} (HTTP ${p.status ?? "?"})` };
    }
    case "webhook_failed":
      return { icon: Send, tone: "bg-bad-soft text-bad", actor: null, text: "Couldn't reach the bots (webhook failed)" };
    case "cancelled":
      return { icon: Ban, tone: "bg-bad-soft text-bad", actor: l.actor, text: "cancelled the event" };
    default:
      return { icon: CircleDot, tone: "bg-subtle text-muted", actor: l.actor, text: l.action.replace(/_/g, " ") };
  }
}

export function Timeline({ log }: { log: LogEntry[] }) {
  if (!log.length) return <p className="text-sm text-muted">No activity yet.</p>;
  const rows = [...log].sort((a, b) => b.created_at.localeCompare(a.created_at)); // newest first
  return (
    <ol className="space-y-3.5">
      {rows.map((l) => {
        const r = describe(l);
        const Icon = r.icon;
        return (
          <li key={l.id} className="flex gap-3 text-sm">
            <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", r.tone)}>
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div>
                {r.actor && r.actor !== "System" && <span className="font-medium">{r.actor} </span>}
                <span className={r.actor ? "text-muted" : "font-medium"}>{r.text}</span>
                {r.quote && <span className="text-fg"> “{clip(r.quote, 140)}”</span>}
                <time dateTime={l.created_at} title={`${shortDate(l.created_at, DEFAULT_TZ)}, ${timeOf(l.created_at, DEFAULT_TZ)}`} className="ml-1.5 whitespace-nowrap text-xs text-muted/80">
                  {relativeTime(l.created_at)}
                </time>
              </div>
              {r.afterNote && <div className="mt-0.5 text-xs text-muted">After organiser note: “{clip(r.afterNote, 90)}”</div>}
              {r.changes && r.changes.length > 0 && (
                <ul className="mt-1.5 space-y-1 rounded-xl border border-line bg-card px-3 py-2 text-[13px]">
                  {r.changes.map(([label, c]) => (
                    <li key={label} className="leading-snug">
                      <span className="text-muted">{label}: </span>
                      <s className="text-muted decoration-bad/60">{fmtValue(c?.from)}</s>
                      <span aria-label="changed to" className="mx-1 text-muted">→</span>
                      <strong className="font-semibold text-fg">{fmtValue(c?.to)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
