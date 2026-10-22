import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Loader2, RefreshCw, Send, TriangleAlert, X } from "lucide-react";
import { useId, useRef, useState, type JSX, type ReactNode, type RefObject } from "react";
import { useNeedsYou } from "../../app/needsYou";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useToast, type ToastInput } from "../../components/ui/Toast";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText } from "../../data/hooks";
import type { Decision } from "../../data/types";
import { EMPTY_CHIPS, NOTE_MAX, noteIsValid, toggleChip, type ChipState, type QuickChip } from "./logic";

export { noteIsValid } from "./logic";

export const RENEGOTIATE_CHIPS: { label: string; note: string }[] = [
  { label: "Different date", note: "Can we find a different date?" },
  { label: "Smaller group", note: "Can we keep the group smaller?" },
  { label: "Bigger space", note: "Can we get a bigger space?" },
  { label: "Different time", note: "Could we start an hour earlier?" },
];

export const DECLINE_CHIPS: { label: string; note: string }[] = [
  { label: "Date doesn't work", note: "The date doesn't work for us." },
  { label: "Not the right fit", note: "This isn't the right fit for our members." },
  { label: "Can't host this", note: "We can't host this one." },
  { label: "Too big for us", note: "It's too big for us." },
];

type Panel = "renegotiate" | "declined";

const TOASTS: Record<Decision, (round: number) => ToastInput> = {
  approved: (round) => ({ title: `Approved round ${round}`, body: "The event page opens for RSVPs once every organiser approves.", tone: "ok" }),
  renegotiate: (round) => ({ title: `Sent. The Bots will start round ${round + 1}`, body: "Every Bot in this collab gets your note." }),
  declined: () => ({ title: "Declined", body: "The other organisers will see your note." }),
};

const DONE_TEXT: Record<Decision, (round: number) => string> = {
  approved: (round) => `You approved round ${round}.`,
  renegotiate: (round) => `Sent to the Bots. Round ${round + 1} starts soon.`,
  declined: () => "You declined this collab.",
};

interface DecisionFormProps {
  token: string;
  round: number;
  label?: string;
  disabledReason?: string | null;
  onResponded?: (decision: Decision) => void;
}

/** Approve (one tap), renegotiate or decline one round of a collab, as one organiser. */
export function DecisionForm(props: DecisionFormProps): JSX.Element {
  // A new token or round starts from a clean form.
  return <DecisionFormInner key={`${props.token}:${props.round}`} {...props} />;
}

function DecisionFormInner({ token, round, label = "Your decision", disabledReason = null, onResponded }: DecisionFormProps) {
  const source = useData();
  const toast = useToast();
  const needsYou = useNeedsYou();
  const gate = useGate("respond");
  const id = useId();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState<Decision | null>(null);
  const [done, setDone] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [renegotiate, setRenegotiate] = useState<ChipState>(EMPTY_CHIPS);
  const [decline, setDecline] = useState<ChipState>(EMPTY_CHIPS);
  const [tried, setTried] = useState<Record<Panel, boolean>>({ renegotiate: false, declined: false });
  const renegotiateRef = useRef<HTMLTextAreaElement>(null);
  const declineRef = useRef<HTMLTextAreaElement>(null);

  const reason = disabledReason || gate.reason;
  const blocked = !!reason;
  const locked = blocked || busy !== null;

  const submit = async (decision: Decision, state: ChipState | null) => {
    if (locked) return;
    setError(null);
    setBusy(decision);
    try {
      await source.respond(token, decision, state ? state.note.trim() : null, state ? state.selected : []);
      setDone(decision);
      setPanel(null);
      setConfirming(false);
      toast(TOASTS[decision](round));
      needsYou.reload();
      onResponded?.(decision);
    } catch (err) {
      setConfirming(false);
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (next: Panel) => {
    setError(null);
    setPanel((current) => (current === next ? null : next));
  };

  const checkNote = (which: Panel): boolean => {
    setTried((t) => ({ ...t, [which]: true }));
    const state = which === "renegotiate" ? renegotiate : decline;
    if (noteIsValid(state.note)) return true;
    (which === "renegotiate" ? renegotiateRef : declineRef).current?.focus();
    return false;
  };

  const headingId = `${id}-label`;
  const panelId = (which: Panel) => `${id}-${which}`;

  return (
    <div role="group" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3">
        <p id={headingId} className="font-semibold leading-snug">
          {label}
        </p>
        <span className="eyebrow tabular shrink-0">Round {round}</span>
      </div>

      {done ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} className="shrink-0 text-ok" aria-hidden />
          {DONE_TEXT[done](round)}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Slot reason={reason} className="col-span-2">
              <button
                type="button"
                className="btn btn-ok w-full"
                disabled={locked}
                aria-busy={busy === "approved" || undefined}
                onClick={() => void submit("approved", null)}
              >
                {busy === "approved" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                Approve
              </button>
            </Slot>
            <Slot reason={reason}>
              <button
                type="button"
                className={`btn w-full ${panel === "renegotiate" ? "border-ink bg-sunken" : ""}`}
                disabled={locked}
                aria-expanded={panel === "renegotiate"}
                aria-controls={panel === "renegotiate" ? panelId("renegotiate") : undefined}
                onClick={() => toggle("renegotiate")}
              >
                <RefreshCw size={16} aria-hidden />
                Renegotiate
              </button>
            </Slot>
            <Slot reason={reason}>
              <button
                type="button"
                className={`btn btn-danger w-full ${panel === "declined" ? "bg-bad-soft" : ""}`}
                disabled={locked}
                aria-expanded={panel === "declined"}
                aria-controls={panel === "declined" ? panelId("declined") : undefined}
                onClick={() => toggle("declined")}
              >
                <X size={16} aria-hidden />
                Decline
              </button>
            </Slot>
          </div>

          <AnimatePresence initial={false} mode="wait">
            {panel ? (
              <motion.div
                key={panel}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="-mx-1 overflow-hidden px-1"
              >
                {panel === "renegotiate" ? (
                  <ReasonPanel
                    id={panelId("renegotiate")}
                    title="What should change?"
                    placeholder="Tell the Bots what would make this work for you."
                    hint="The Bots use this to plan the next round. The other organisers see it too."
                    chips={RENEGOTIATE_CHIPS}
                    state={renegotiate}
                    onChange={setRenegotiate}
                    showError={tried.renegotiate}
                    disabled={busy !== null}
                    inputRef={renegotiateRef}
                    action={
                      <Slot reason={reason} className="w-full sm:w-auto">
                        <button
                          type="button"
                          className="btn btn-primary w-full"
                          disabled={locked}
                          aria-busy={busy === "renegotiate" || undefined}
                          onClick={() => {
                            if (checkNote("renegotiate")) void submit("renegotiate", renegotiate);
                          }}
                        >
                          {busy === "renegotiate" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
                          Send to the Bots
                        </button>
                      </Slot>
                    }
                  />
                ) : (
                  <ReasonPanel
                    id={panelId("declined")}
                    title="Why not?"
                    placeholder="A short, friendly reason for the other organisers."
                    hint="The other organisers will see this."
                    chips={DECLINE_CHIPS}
                    state={decline}
                    onChange={setDecline}
                    showError={tried.declined}
                    disabled={busy !== null}
                    inputRef={declineRef}
                    action={
                      <Slot reason={reason} className="w-full sm:w-auto">
                        <button
                          type="button"
                          className="btn btn-danger w-full"
                          disabled={locked}
                          aria-busy={busy === "declined" || undefined}
                          onClick={() => {
                            if (checkNote("declined")) setConfirming(true);
                          }}
                        >
                          {busy === "declined" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <X size={16} aria-hidden />}
                          Decline…
                        </button>
                      </Slot>
                    }
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => {
          if (busy === null) setConfirming(false);
        }}
        onConfirm={() => void submit("declined", decline)}
        title="Decline this collab?"
        body="The other organisers will see your note. This ends the collab for everyone."
        confirmLabel="Decline"
        destructive
        busy={busy === "declined"}
      />
    </div>
  );
}

/** Grid cell that keeps the "why is this disabled" tooltip reachable. */
function Slot({ reason, className = "", children }: { reason: string | null; className?: string; children: ReactNode }) {
  return (
    <div className={`flex ${className}`}>
      <Tooltip label={reason} focusable={!!reason} className="w-full">
        {children}
      </Tooltip>
    </div>
  );
}

function ReasonPanel({
  id,
  title,
  placeholder,
  hint,
  chips,
  state,
  onChange,
  showError,
  disabled,
  inputRef,
  action,
}: {
  id: string;
  title: string;
  placeholder: string;
  hint: string;
  chips: QuickChip[];
  state: ChipState;
  onChange: (state: ChipState) => void;
  showError: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  action: ReactNode;
}) {
  const noteId = `${id}-note`;
  const hintId = `${id}-hint`;
  const invalid = showError && !noteIsValid(state.note);
  return (
    <div id={id} className="space-y-4 pb-1 pt-4">
      <div role="group" aria-label="Quick reasons" className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="chip-btn"
            aria-pressed={state.selected.includes(chip.label)}
            disabled={disabled}
            onClick={() => onChange(toggleChip(state, chips, chip.label))}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor={noteId} className="mb-1.5 block text-sm font-medium">
          {title}
        </label>
        <textarea
          id={noteId}
          ref={inputRef}
          className="input"
          rows={3}
          maxLength={NOTE_MAX}
          required
          value={state.note}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          onChange={(event) => onChange({ ...state, note: event.target.value })}
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-xs">
          <p id={hintId} className={invalid ? "font-medium text-bad" : "text-muted"}>
            {invalid ? "Write at least 3 characters so the others know why." : hint}
          </p>
          <span className="tabular shrink-0 text-faint" aria-hidden>
            {state.note.length}/{NOTE_MAX}
          </span>
        </div>
      </div>
      <div className="flex">{action}</div>
    </div>
  );
}
