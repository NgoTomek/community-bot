import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNow } from "../../data/hooks";
import type { Job } from "../../data/types";
import { buildSteps, stepIndex, type StepDef, type StepState } from "./progress";

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
        <Check size={14} strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Loader2 size={14} className="animate-spin" aria-hidden />
      </span>
    );
  }
  return <span className="size-6 shrink-0 rounded-full border border-dashed border-line-strong" aria-hidden />;
}

/**
 * Live step list for a job. Known progress values tick off steps; anything else the backend
 * sends is shown as it came. The current step spins.
 */
export function JobSteps({
  defs,
  job,
  label,
  startedAt,
}: {
  defs: StepDef[];
  job: Pick<Job, "status" | "progress"> | null | undefined;
  label: string;
  /** Epoch ms when this tab submitted the job, for the elapsed counter. */
  startedAt?: number | null;
}) {
  const [reached, setReached] = useState(-1);
  const index = stepIndex(defs, job?.progress);
  if (index > reached) setReached(index);
  const steps = buildSteps(defs, job, Math.max(reached, index));
  const current = steps.find((s) => s.state === "current");
  const now = useNow(1000);
  const elapsed = startedAt ? Math.max(0, Math.round((now.getTime() - startedAt) / 1000)) : null;

  return (
    <div>
      <ol className="space-y-3" aria-label={label}>
        <AnimatePresence initial={false}>
          {steps.map((step) => (
            <motion.li
              key={step.id}
              layout="position"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-3"
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <StepIcon state={step.state} />
              <span className={step.state === "current" ? "font-medium" : step.state === "done" ? "text-muted" : "text-faint"}>{step.label}</span>
              {step.state === "current" ? (
                <span className="typing-dots text-faint" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
              <span className="sr-only">{step.state === "done" ? "(done)" : step.state === "todo" ? "(to do)" : "(in progress)"}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {elapsed !== null ? (
        <p className="mt-4 text-xs tabular text-faint" aria-hidden>
          {elapsed} s
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {current ? current.label : "Done"}
      </p>
    </div>
  );
}
