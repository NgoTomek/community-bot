import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleSlash, History, PenLine, RefreshCw } from "lucide-react";
import type { EventPhase } from "./logic";

const PHASES: Record<EventPhase, { label: string; cls: string; icon: typeof CheckCircle2; text: string }> = {
  draft: {
    label: "Draft",
    cls: "bg-warn-soft text-warn border-warn/25",
    icon: PenLine,
    text: "Waiting for every organiser to approve",
  },
  confirmed: {
    label: "Confirmed",
    cls: "bg-ok-soft text-ok border-ok/25",
    icon: CheckCircle2,
    text: "Every organiser approved. It's happening.",
  },
  renegotiating: {
    label: "Being renegotiated",
    cls: "bg-warn-soft text-warn border-warn/25",
    icon: RefreshCw,
    text: "An organiser asked for changes, so the Bots are working on a new round. Details may change.",
  },
  replaced: {
    label: "Replaced",
    cls: "bg-sunken text-muted border-line",
    icon: History,
    text: "The organisers agreed a newer version of this event.",
  },
  declined: {
    label: "Declined",
    cls: "bg-bad-soft text-bad border-bad/25",
    icon: CircleSlash,
    text: "An organiser declined, so this event won't go ahead.",
  },
};

const fade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

export function EventStatusPill({ phase }: { phase: EventPhase }) {
  const p = PHASES[phase];
  const Icon = p.icon;
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span key={phase} {...fade} className={`pill ${p.cls}`}>
        <Icon size={12} aria-hidden />
        {p.label}
      </motion.span>
    </AnimatePresence>
  );
}

/** One sentence on where the event stands. Announced to screen readers when it changes. */
export function EventStatusText({ phase, className = "" }: { phase: EventPhase; className?: string }) {
  return (
    <p className={className} aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false} mode="wait">
        <motion.span key={phase} {...fade} className="inline-block">
          {PHASES[phase].text}
        </motion.span>
      </AnimatePresence>
    </p>
  );
}
