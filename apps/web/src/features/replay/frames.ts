import type { DealVersion, Message, Run } from "../../data/types";
import { roundAt } from "../../lib/timeline";
import type { ReplayData } from "./model";

/** How long "Deal compiled" takes to appear after the last post before it (1x). */
export const COMPILE_DELAY_MS = 1500;
/** Pause before the run's outcome (confirmed, declined, stopped, error) appears (1x). */
export const OUTCOME_DELAY_MS = 1200;

export type ReplayStep =
  | { kind: "message"; key: string; delayMs: number; message: Message }
  | { kind: "deal"; key: string; delayMs: number; deal: DealVersion }
  | { kind: "outcome"; key: string; delayMs: number };

export type TimelineRun = Pick<Run, "round" | "status" | "control" | "error" | "declineReason">;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Runs that ended: the replay closes with their outcome. */
export function isTerminal(run: Pick<Run, "status" | "control">): boolean {
  return run.status === "confirmed" || run.status === "declined" || run.status === "error" || run.control === "stopped";
}

/**
 * The recording as steps: posts in seq order, each deal right after the last post written before
 * it was compiled, and the outcome last when the run ended.
 */
export function buildSteps(data: Pick<ReplayData, "run" | "messages" | "deals">): ReplayStep[] {
  const deals = [...data.deals].sort((a, b) => a.round - b.round || time(a.createdAt) - time(b.createdAt));
  const messages = [...data.messages].sort((a, b) => a.message.seq - b.message.seq);
  const steps: ReplayStep[] = [];
  const dealStep = (deal: DealVersion): ReplayStep => ({ kind: "deal", key: `deal:${deal.id}`, delayMs: COMPILE_DELAY_MS, deal });
  let next = 0;
  for (const { message, delayMs } of messages) {
    const at = time(message.createdAt);
    while (next < deals.length && time(deals[next].createdAt) < at) steps.push(dealStep(deals[next++]));
    steps.push({ kind: "message", key: `m:${message.id}`, delayMs, message });
  }
  while (next < deals.length) steps.push(dealStep(deals[next++]));
  if (isTerminal(data.run)) steps.push({ kind: "outcome", key: "outcome", delayMs: OUTCOME_DELAY_MS });
  return steps;
}

export interface ReplayFrame {
  messages: Message[];
  deals: DealVersion[];
  /** Run state as of this frame, for buildTimeline: the real run only once the replay is over. */
  run: TimelineRun;
  /** The step the replay is waiting for. */
  next: ReplayStep | null;
  finished: boolean;
  posts: { shown: number; total: number };
}

/** What is on screen after `revealed` steps. */
export function frameAt(steps: ReplayStep[], run: Run, revealed: number): ReplayFrame {
  const count = Math.max(0, Math.min(Math.floor(revealed), steps.length));
  const shown = steps.slice(0, count);
  const messages = shown.flatMap((s) => (s.kind === "message" ? [s.message] : []));
  const deals = shown.flatMap((s) => (s.kind === "deal" ? [s.deal] : []));
  const finished = count >= steps.length;
  const total = steps.reduce((n, s) => n + (s.kind === "message" ? 1 : 0), 0);

  let frameRun: TimelineRun;
  if (finished) {
    frameRun = { round: run.round, status: run.status, control: run.control, error: run.error, declineReason: run.declineReason };
  } else {
    const last = messages[messages.length - 1];
    const round = last ? roundAt(time(last.createdAt), deals.map((d) => time(d.createdAt)), run.round) : 1;
    frameRun = { round, status: "negotiating", control: "running", error: null, declineReason: null };
  }

  return { messages, deals, run: frameRun, next: steps[count] ?? null, finished, posts: { shown: messages.length, total } };
}
