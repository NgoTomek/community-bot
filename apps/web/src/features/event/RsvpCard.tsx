import { buildIcs, type Deal } from "@community-bots/core";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarPlus, CheckCircle2, Clock, Loader2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText } from "../../data/hooks";
import { longDate } from "../../lib/format";
import { appUrl } from "../../lib/share";
import { icsFileName, readRsvp, RSVP_NAME_MAX, rsvpNameError, saveRsvp, type EventPhase, type SavedRsvp } from "./logic";

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Downloads the deal as an .ics file. Tentative until every organiser has approved. */
export function downloadIcs(deal: Deal, dealId: string, confirmed: boolean) {
  const ics = buildIcs(deal, { uid: dealId, url: appUrl(`/event/${dealId}`), confirmed });
  const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = icsFileName(deal.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** RSVP form, live "N going" counter and the calendar download. Key it by deal id. */
export function RsvpCard({ dealId, deal, phase, count, latestDealId }: { dealId: string; deal: Deal; phase: EventPhase; count: number; latestDealId: string | null }) {
  const source = useData();
  const gate = useGate("rsvp");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedRsvp | null>(() => readRsvp(localStore(), dealId));
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = phase === "confirmed";
  const closed = phase === "declined" || phase === "replaced";
  const nameError = rsvpNameError(name);
  const showNameError = tried && !!nameError;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!open || gate.disabled || busy) return;
    setTried(true);
    if (nameError) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const clean = name.trim();
      await source.rsvp(dealId, clean);
      const entry = { name: clean, at: new Date().toISOString() };
      saveRsvp(localStore(), dealId, entry);
      setSaved(entry);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-2xl leading-tight">
            Are you coming?
          </h2>
          <p className="mt-1 text-sm text-muted">Space for {deal.capacity} people</p>
        </div>
        <p className="shrink-0 text-right leading-none" aria-live="polite" aria-atomic="true">
          <AnimatePresence initial={false}>
            <motion.span
              key={count}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="block font-display text-4xl tabular"
            >
              {count}
            </motion.span>
          </AnimatePresence>
          <span className="mt-1 block text-sm text-muted"> going</span>
        </p>
      </div>

      {closed ? (
        <div className="mt-5 rounded-lg bg-sunken p-4 text-sm">
          {phase === "declined" ? (
            <p>This event won't go ahead, so RSVPs are closed.</p>
          ) : (
            <>
              <p>This is an earlier version. RSVPs are on the latest one.</p>
              {latestDealId ? (
                <Link to={`/event/${latestDealId}`} className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  Open the latest version <ArrowRight size={14} aria-hidden />
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : saved ? (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-5 rounded-lg border border-ok/25 bg-ok-soft p-4"
        >
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden />
            You're going, {saved.name}!
          </p>
          <p className="mt-1 text-sm text-muted">
            See you on {longDate(deal.date)} at <span className="tabular">{deal.time}</span>.
            {phase !== "confirmed" ? " Some details may still change." : ""}
          </p>
        </motion.div>
      ) : (
        <form className="mt-5 print:hidden" onSubmit={(event) => void submit(event)} noValidate>
          <fieldset disabled={!open || busy} className="space-y-3">
            <div>
              <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-medium">
                Your name
              </label>
              <input
                id={`${id}-name`}
                ref={inputRef}
                className="input"
                value={name}
                maxLength={RSVP_NAME_MAX}
                autoComplete="name"
                placeholder="A first name is fine"
                aria-required
                aria-invalid={showNameError || undefined}
                aria-describedby={showNameError ? `${id}-name-error` : undefined}
                onChange={(event) => setName(event.target.value)}
              />
              {showNameError ? (
                <p id={`${id}-name-error`} className="mt-1 text-xs font-medium text-bad">
                  {nameError}
                </p>
              ) : null}
            </div>
            <Tooltip label={gate.reason} focusable={gate.disabled} className="w-full">
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={!open || busy || gate.disabled} aria-busy={busy || undefined}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                I'm going
              </button>
            </Tooltip>
          </fieldset>
          {!open ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
              RSVPs open when every organiser has approved
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
              <span>{error}</span>
            </p>
          ) : null}
        </form>
      )}

      {!closed ? (
        <div className="mt-5 border-t border-line pt-4 print:hidden">
          <button type="button" className={`btn w-full ${saved ? "btn-primary" : ""}`} onClick={() => downloadIcs(deal, dealId, phase === "confirmed")}>
            <CalendarPlus size={16} aria-hidden />
            Add to calendar
          </button>
          {phase !== "confirmed" ? <p className="mt-2 text-center text-xs text-muted">Saved as tentative until every organiser approves.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
