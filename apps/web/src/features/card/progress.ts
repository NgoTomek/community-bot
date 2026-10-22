import type { JobStatus } from "../../data/types";

export interface StepDef {
  /** The job.progress value this step stands for. */
  key: string;
  label: string;
}

export type StepState = "done" | "current" | "todo";

export interface StepView {
  id: string;
  label: string;
  state: StepState;
  /** True for a progress string the app does not know, shown as the backend sent it. */
  verbatim: boolean;
}

export const DRAFT_STEPS: StepDef[] = [
  { key: "browsing", label: "Browsing the page" },
  { key: "reading the page", label: "Reading the page" },
  { key: "writing card", label: "Writing the card" },
];

export const MATCH_STEPS: StepDef[] = [
  { key: "reading cards", label: "Reading the cards" },
  { key: "ranking communities", label: "Ranking communities" },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[.…]+$/, "").replace(/\s+/g, " ");

/** Index of the known step a progress string stands for, or -1. */
export function stepIndex(defs: StepDef[], progress: string | null | undefined): number {
  if (!progress) return -1;
  const p = norm(progress);
  return defs.findIndex((d) => norm(d.key) === p || norm(d.label) === p);
}

/**
 * The step list for a job. Known progress values tick off the steps before them. Anything
 * else is shown verbatim as the current step, right after the furthest known step reached.
 */
export function buildSteps(
  defs: StepDef[],
  job: { status: JobStatus; progress: string | null } | null | undefined,
  reached = -1,
): StepView[] {
  const known = (d: StepDef, state: StepState): StepView => ({ id: d.key, label: d.label, state, verbatim: false });
  if (job?.status === "done") return defs.map((d) => known(d, "done"));
  const index = stepIndex(defs, job?.progress);
  if (index >= 0) return defs.map((d, i) => known(d, i < index ? "done" : i === index ? "current" : "todo"));
  const after = Math.min(reached, defs.length - 1);
  const label = job?.progress?.trim() || (!job || job.status === "queued" ? "Waiting for a Bot to pick this up" : after >= 0 ? "Finishing up" : "Starting");
  return [
    ...defs.slice(0, after + 1).map((d) => known(d, "done")),
    { id: `verbatim:${label}`, label, state: "current", verbatim: true },
    ...defs.slice(after + 1).map((d) => known(d, "todo")),
  ];
}
