import type { BackendName, Fit, Stance } from "@community-bots/core";
import { Bot, FlaskConical, PenLine } from "lucide-react";
import type { ApprovalStatus, Run } from "../data/types";

export function BotTag() {
  return (
    <span className="pill h-5 gap-1 border-accent/25 bg-accent-soft px-1.5 text-[11px] text-accent" title="Written by a Bot, not a person">
      <Bot size={12} aria-hidden />
      Bot
    </span>
  );
}

const STANCE: Record<Stance, { label: string; cls: string }> = {
  offer: { label: "Offer", cls: "bg-accent-soft text-accent border-accent/20" },
  counter: { label: "Counter", cls: "bg-warn-soft text-warn border-warn/25" },
  accept: { label: "Accept", cls: "bg-ok-soft text-ok border-ok/25" },
  decline: { label: "Decline", cls: "bg-bad-soft text-bad border-bad/25" },
  question: { label: "Question", cls: "bg-sunken text-muted border-line" },
};

export function StanceChip({ stance }: { stance: Stance }) {
  const s = STANCE[stance];
  return <span className={`pill h-5 px-2 text-[11px] ${s.cls}`}>{s.label}</span>;
}

const APPROVAL: Record<ApprovalStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-sunken text-muted border-line" },
  approved: { label: "Approved", cls: "bg-ok-soft text-ok border-ok/25" },
  declined: { label: "Declined", cls: "bg-bad-soft text-bad border-bad/25" },
  renegotiate: { label: "Asked to renegotiate", cls: "bg-warn-soft text-warn border-warn/25" },
};

export function ApprovalPill({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL[status];
  return <span className={`pill ${s.cls}`}>{s.label}</span>;
}

export function runStatusLabel(run: Pick<Run, "status" | "control">): string {
  if (run.control === "stopped") return "Stopped";
  if (run.control === "paused" && run.status !== "confirmed" && run.status !== "declined") return "Paused";
  switch (run.status) {
    case "matching":
      return "Matching";
    case "negotiating":
      return "Negotiating";
    case "compiling":
      return "Compiling the deal";
    case "pending_approval":
      return "Out for approval";
    case "confirmed":
      return "Confirmed";
    case "declined":
      return "Declined";
    default:
      return "Failed";
  }
}

export function RunStatusPill({ run }: { run: Pick<Run, "status" | "control"> }) {
  const label = runStatusLabel(run);
  const live = run.control === "running" && (run.status === "negotiating" || run.status === "compiling" || run.status === "matching");
  const cls =
    label === "Confirmed"
      ? "bg-ok-soft text-ok border-ok/25"
      : label === "Declined" || label === "Failed"
        ? "bg-bad-soft text-bad border-bad/25"
        : label === "Paused" || label === "Out for approval"
          ? "bg-warn-soft text-warn border-warn/25"
          : label === "Stopped"
            ? "bg-sunken text-muted border-line"
            : "bg-accent-soft text-accent border-accent/20";
  return (
    <span className={`pill ${cls}`}>
      {live ? (
        <span className="relative mr-0.5 flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {label}
    </span>
  );
}

/** Mandatory on anything produced by the mock backend. */
export function SampleBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="pill border-warn/30 bg-warn-soft text-warn" title="Produced by the mock backend. No Bot ran.">
      <FlaskConical size={12} aria-hidden />
      {compact ? "Sample data" : "Sample data, not a real Bot run"}
    </span>
  );
}

export function DraftBadge() {
  return (
    <span className="pill border-dashed border-line-strong text-muted" title="Drafted by a Bot from public pages. The community has not confirmed it.">
      <PenLine size={12} aria-hidden />
      Draft from public info
    </span>
  );
}

const BACKEND_LABEL: Record<BackendName, string> = { mock: "Mock", grokbot: "Grok Bot", openai: "OpenAI" };

export function backendLabel(backend: BackendName | null | undefined): string {
  return backend ? BACKEND_LABEL[backend] : "Unknown";
}

export function BackendBadge({ backend, title }: { backend: BackendName | null | undefined; title?: string }) {
  const dot = backend === "mock" ? "bg-warn" : backend ? "bg-ok" : "bg-faint";
  return (
    <span className="pill border-line bg-surface text-muted" title={title ?? "Which brain the Bots use"}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {backendLabel(backend)}
    </span>
  );
}

const FIT: Record<Fit, string> = {
  strong: "bg-ok-soft text-ok border-ok/25",
  good: "bg-accent-soft text-accent border-accent/20",
  weak: "bg-sunken text-muted border-line",
};

export function FitBadge({ fit }: { fit: Fit }) {
  return <span className={`pill ${FIT[fit]}`}>{fit === "strong" ? "Strong fit" : fit === "good" ? "Good fit" : "Weak fit"}</span>;
}

export function RolePill({ role }: { role: string }) {
  return <span className="pill border-line bg-surface-2 capitalize text-muted">{role}</span>;
}

export function YouTag() {
  return <span className="pill h-5 border-accent/30 px-1.5 text-[11px] text-accent">You</span>;
}
