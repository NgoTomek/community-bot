"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Loader2, RotateCcw, Send, Undo2, X, XCircle } from "lucide-react";
import { Glow, btn, cx, inputCls } from "./ui";
import { Confetti } from "./Confetti";
import { ensureOnline, toast } from "./Toaster";
import type { Decision, EventStatus, TeamApprovalState } from "@/lib/types";

const QUICK_PICKS: { label: string; text: string }[] = [
  { label: "Different date", text: "Please find a different date. A weekday evening later in the month would work better for us." },
  { label: "Lower budget", text: "Please bring the budget down. Aim for a free or lower-priced ticket and cheaper catering." },
  { label: "Change venue", text: "Please find a different venue: somewhere more central, step-free and easy to reach by public transport." },
];
const PRESETS = new Set(QUICK_PICKS.map((q) => q.text));

/** Small pulsing dot used for "Waiting for bots…" states. */
export function PulseDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("relative inline-flex size-2.5 shrink-0", className)}>
      <span className="absolute inset-0 animate-ping rounded-full bg-warn opacity-60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-warn" />
    </span>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-up safe-bottom absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] max-w-[520px] overflow-y-auto rounded-t-3xl border border-line bg-card px-5 pt-5 shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.25)]">
        <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-line" />
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-muted hover:bg-subtle">
          <X aria-hidden className="size-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ReviewActions({
  eventId,
  slug,
  title,
  status,
  myState,
  waitingOn,
  revision,
}: {
  eventId: string;
  slug: string;
  title: string;
  status: EventStatus;
  /** null = the organiser's team isn't required on this event. */
  myState: TeamApprovalState | null;
  waitingOn: string[];
  revision?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | Decision>(null);
  const [sheet, setSheet] = useState<null | "renegotiate" | "reject">(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const prev = useRef(status);

  // Celebrate on every open screen when the event flips to published (including the other phone).
  useEffect(() => {
    if (prev.current !== "published" && status === "published") setCelebrate(true);
    prev.current = status;
  }, [status]);

  async function send(decision: Decision) {
    if (busy || !ensureOnline()) return;
    setBusy(decision);
    try {
      const body: { decision: Decision; note?: string } = { decision };
      if (decision === "renegotiate") body.note = note.trim();
      if (decision === "rejected" && reason.trim()) body.note = reason.trim();
      const res = await fetch(`/api/events/${eventId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; justPublished?: boolean };
      if (!res.ok) throw new Error(data.error || `Something went wrong (HTTP ${res.status})`);
      setSheet(null);
      if (decision === "approved") {
        if (data.justPublished) setCelebrate(true);
        else toast(waitingOn.length ? `Accepted. Waiting on ${waitingOn.join(", ")}.` : "Accepted", "success");
      } else if (decision === "renegotiate") {
        setResent(note.trim());
        setNote("");
      } else {
        setReason("");
        toast("Event rejected and removed from the queue", "info");
        router.push("/approvals");
        return;
      }
      router.refresh();
    } catch (e) {
      if (e instanceof TypeError) toast("You're offline. Try again when you're back online.", "offline");
      else toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const publicUrl = () => `${window.location.origin}/e/${slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl());
      toast("Link copied", "success");
    } catch {
      toast(publicUrl(), "info");
    }
  };

  const pick = (text: string) => {
    setNote((cur) => {
      const t = cur.trim();
      if (!t || PRESETS.has(t)) return text;
      if (t.includes(text)) return cur;
      return `${t} ${text}`;
    });
  };

  const open = status === "proposed" || status === "renegotiating";
  const renegotiating = status === "renegotiating";
  const stale = myState === "stale";
  const accepted = myState === "approved" && !renegotiating;

  let bar: ReactNode = null;
  if (status === "published") {
    bar = (
      <div className="flex gap-2">
        <Link href={`/e/${slug}`} className={`${btn.primary} flex-1`}>
          View event
        </Link>
        <button type="button" onClick={copy} className={`${btn.secondary} flex-1`}>
          <Copy aria-hidden className="size-4" /> Copy link
        </button>
      </div>
    );
  } else if (open && myState !== null) {
    bar = (
      <div className="space-y-2">
        {renegotiating && (
          <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-warn" role="status">
            <PulseDot /> Waiting for bots… you can still decide now.
          </div>
        )}
        {accepted ? (
          <div className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-ok-soft px-3 py-1.5 text-center">
            <span className="flex items-center gap-1 text-[15px] font-semibold text-ok">
              <Check aria-hidden className="size-4" strokeWidth={3} /> You accepted
            </span>
            {waitingOn.length > 0 && <span className="text-xs text-ok/80">Waiting on {waitingOn.join(", ")}</span>}
          </div>
        ) : (
          <button type="button" onClick={() => send("approved")} disabled={!!busy} className={`${btn.primary} w-full`}>
            {busy === "approved" ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : stale ? (
              <RotateCcw aria-hidden className="size-4" strokeWidth={2.5} />
            ) : (
              <Check aria-hidden className="size-4.5" strokeWidth={3} />
            )}
            {stale ? "Re-accept" : renegotiating ? "Accept as is" : "Accept"}
          </button>
        )}
        <div className="flex items-center gap-2">
          {!renegotiating && (
            <button type="button" onClick={() => setSheet("renegotiate")} disabled={!!busy} className={`${btn.secondary} min-w-0 flex-1 px-3`}>
              <Undo2 aria-hidden className="size-4 shrink-0" /> Send back to bots
            </button>
          )}
          <button
            type="button"
            onClick={() => setSheet("reject")}
            disabled={!!busy}
            className={cx(
              "min-h-12 shrink-0 rounded-xl px-4 text-[15px] font-semibold text-bad underline-offset-4 hover:underline focus-visible:underline disabled:opacity-50",
              renegotiating && "flex-1",
            )}
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {bar && (
        <>
          {/* Spacer so the last section can scroll clear of the fixed bar. */}
          <div aria-hidden className={open ? "h-24" : "h-4"} />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
            <div className="safe-bottom mx-auto max-w-[520px] px-4 pt-3">{bar}</div>
          </div>
        </>
      )}

      {sheet === "renegotiate" && (
        <Sheet label="Send back to bots" onClose={() => setSheet(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim().length >= 3) send("renegotiate");
            }}
          >
            <h2 className="flex items-center gap-2 pr-10 text-xl font-bold tracking-tight">
              <Bot aria-hidden className="size-5 text-warn" /> Send back to bots
            </h2>
            <p className="mt-1 text-sm text-muted">
              The bots revise “{title}” and send a new version{revision ? ` (v${revision + 1})` : ""}. Every team then decides again.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick picks">
              {QUICK_PICKS.map((q) => {
                const on = note.includes(q.text);
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => pick(q.text)}
                    aria-pressed={on}
                    className={cx(
                      "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.97]",
                      on ? "border-accent/50 bg-accent-soft text-accent-text" : "border-line bg-card text-fg hover:border-accent/40 hover:bg-subtle",
                    )}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
            <label htmlFor="renegotiate-note" className="mt-4 block text-sm font-semibold">
              Note for the bots <span className="font-normal text-muted">(required)</span>
            </label>
            <textarea
              id="renegotiate-note"
              autoFocus
              required
              minLength={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={1000}
              className={`${inputCls} mt-1.5`}
              placeholder="What should change? e.g. Can it finish by 21:30? The venue closes at 22:00."
            />
            <div className="mt-1 text-xs text-muted">{note.trim().length < 3 ? "Write at least 3 characters." : `${note.length}/1000`}</div>
            <button type="submit" disabled={!!busy || note.trim().length < 3} className={`${btn.primary} mb-4 mt-4 w-full`}>
              {busy === "renegotiate" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Undo2 aria-hidden className="size-4" />}
              Send back to bots
            </button>
          </form>
        </Sheet>
      )}

      {sheet === "reject" && (
        <Sheet label="Reject event" onClose={() => setSheet(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send("rejected");
            }}
          >
            <h2 className="flex items-center gap-2 pr-10 text-xl font-bold tracking-tight">
              <XCircle aria-hidden className="size-5 text-bad" /> Reject this event?
            </h2>
            <p className="mt-1 text-sm text-muted">This is final. “{title}” won&apos;t be published and the bots can&apos;t revise it.</p>
            <label htmlFor="reject-reason" className="mt-4 block text-sm font-semibold">
              Reason <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="reject-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className={`${inputCls} mt-1.5`}
              placeholder="e.g. Clashes with the summer showcase."
            />
            <button type="submit" disabled={!!busy} className={`${btn.danger} mt-4 w-full`}>
              {busy === "rejected" && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Reject event
            </button>
            <button type="button" onClick={() => setSheet(null)} className="mb-2 mt-1 min-h-11 w-full text-sm font-medium text-muted hover:text-fg">
              Keep it open
            </button>
          </form>
        </Sheet>
      )}

      {celebrate && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/95 px-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Published">
          <Confetti />
          <div className="relative isolate w-full max-w-sm text-center">
            <Glow className="-inset-x-10 -top-16 bottom-1/3" />
            <svg viewBox="0 0 64 64" className="pop mx-auto size-28 text-ok" aria-hidden>
              <circle className="check-circle" cx="32" cy="32" r="25" fill="none" stroke="currentColor" strokeWidth="4" />
              <path className="check-mark" d="M20 33 l8 8 l16 -18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="mt-5 text-3xl font-bold tracking-tight">Published</h2>
            <p className="mt-2 text-[15px] text-muted">Every team said yes. “{title}” is live on the calendar and open for RSVPs.</p>
            <div className="mt-7 grid gap-2">
              <Link href={`/e/${slug}`} className={btn.primary}>
                View event
              </Link>
              <button type="button" onClick={copy} className={btn.secondary}>
                <Copy aria-hidden className="size-4" /> Copy link
              </button>
              <button type="button" onClick={() => setCelebrate(false)} className="min-h-11 text-sm font-medium text-muted hover:text-fg">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {resent !== null && (
        <div
          className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/95 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Sent back to the agents"
          onClick={() => setResent(null)}
        >
          <div className="relative isolate w-full max-w-sm text-center">
            <Glow className="-inset-x-10 -top-16 bottom-1/3" />
            <div aria-hidden className="relative mx-auto size-32">
              <span className="resend-ring absolute inset-0 rounded-full border-2 border-accent" />
              <span className="resend-ring absolute inset-0 rounded-full border-2 border-accent [animation-delay:600ms]" />
              <span className="pop absolute inset-5 flex items-center justify-center rounded-full bg-accent text-white shadow-lg">
                <Bot className="size-11" />
              </span>
              <Send className="resend-fly absolute -right-1 top-1 size-7 text-accent" />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight">Resent to agents</h2>
            <p className="mt-2 text-[15px] text-muted">
              The bots are re-evaluating “{title}” with your note. You'll see the revised version here.
            </p>
            {resent && (
              <p className="mx-auto mt-4 max-w-xs rounded-2xl bg-subtle px-4 py-3 text-left text-sm italic text-fg/80">“{resent}”</p>
            )}
            <div className="mt-5 flex items-center justify-center gap-2 text-[13px] font-semibold text-warn" role="status">
              <PulseDot /> Agents re-evaluating…
            </div>
            <button type="button" onClick={() => setResent(null)} className={`${btn.secondary} mt-6 w-full`}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
