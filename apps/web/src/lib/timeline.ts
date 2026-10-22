import type { ApprovalView, DealVersion, Message, Run } from "../data/types";

export type TimelineEventKind = "round" | "deal" | "renegotiate" | "declined" | "approved" | "confirmed" | "stopped" | "error";

export type TimelineItem =
  | { kind: "message"; key: string; at: number; order: number; round: number; message: Message }
  | {
      kind: "event";
      key: string;
      at: number;
      order: number;
      round: number;
      event: TimelineEventKind;
      text: string;
      note?: string | null;
      communityId?: string;
      dealId?: string;
    };

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Round a message belongs to: deals compiled before it, plus one, never past the run's round. */
export function roundAt(at: number, dealTimes: number[], runRound: number): number {
  const before = dealTimes.filter((t) => t < at).length;
  return Math.max(1, Math.min(before + 1, runRound));
}

/**
 * Messages plus the system events derived from deals, approvals and run state:
 * "Deal compiled", "Round 2 started", "X asked to renegotiate: note", "X declined", "Confirmed".
 */
export function buildTimeline(input: {
  run: Pick<Run, "round" | "status" | "control" | "error" | "declineReason">;
  messages: Message[];
  deals: DealVersion[];
  approvals: ApprovalView[];
}): TimelineItem[] {
  const { run, messages, approvals } = input;
  const deals = [...input.deals].sort((a, b) => a.round - b.round);
  const dealTimes = deals.map((d) => time(d.createdAt));
  const items: TimelineItem[] = [];

  for (const message of messages) {
    const at = time(message.createdAt);
    items.push({ kind: "message", key: `m:${message.id}`, at, order: message.seq, round: roundAt(at, dealTimes, run.round), message });
  }

  for (const deal of deals) {
    items.push({
      kind: "event",
      key: `deal:${deal.id}`,
      at: time(deal.createdAt),
      order: 1e6,
      round: deal.round,
      event: "deal",
      text: deal.round > 1 ? `Deal compiled for round ${deal.round}` : "Deal compiled",
      dealId: deal.id,
    });
  }

  let latestDecisionAt = 0;
  const latestDealAt = dealTimes.length ? dealTimes[dealTimes.length - 1] : 0;
  for (const approval of approvals) {
    const history = approval.history ?? [];
    if (history.length) {
      history.forEach((entry, i) => {
        if (entry.decision === "pending") return;
        const at = time(entry.at);
        latestDecisionAt = Math.max(latestDecisionAt, at);
        items.push(decisionEvent(`${approval.communityId}:${i}`, at, entry.round, approval, entry.decision, entry.note));
      });
    } else if (approval.status !== "pending" && approval.status !== "approved") {
      const at = latestDealAt + 1;
      latestDecisionAt = Math.max(latestDecisionAt, at);
      items.push(decisionEvent(`${approval.communityId}:now`, at, approval.round ?? run.round, approval, approval.status, approval.note));
    }
  }

  for (let round = 2; round <= run.round; round++) {
    const previousDealAt = dealTimes[round - 2] ?? 0;
    const first = items
      .filter((i) => i.kind === "message" && i.round === round)
      .sort((a, b) => a.at - b.at)[0];
    const at = first ? first.at - 0.5 : Math.max(previousDealAt, latestDecisionAt) + 2;
    items.push({ kind: "event", key: `round:${round}`, at, order: -1, round, event: "round", text: `Round ${round} started` });
  }

  const end = items.reduce((max, i) => Math.max(max, i.at), 0) + 3;
  if (run.status === "confirmed") {
    items.push({ kind: "event", key: "confirmed", at: end, order: 0, round: run.round, event: "confirmed", text: "Everyone approved. The collab is confirmed." });
  } else if (run.status === "declined" && !items.some((i) => i.kind === "event" && i.event === "declined")) {
    items.push({ kind: "event", key: "declined", at: end, order: 0, round: run.round, event: "declined", text: "The collab was declined", note: run.declineReason });
  } else if (run.control === "stopped") {
    items.push({ kind: "event", key: "stopped", at: end, order: 0, round: run.round, event: "stopped", text: "Stopped by an organiser" });
  } else if (run.status === "error") {
    items.push({ kind: "event", key: "error", at: end, order: 0, round: run.round, event: "error", text: "The run stopped with an error", note: run.error });
  }

  return items.sort((a, b) => a.at - b.at || a.order - b.order);
}

function decisionEvent(
  key: string,
  at: number,
  round: number,
  approval: ApprovalView,
  decision: ApprovalView["status"],
  note: string | null,
): TimelineItem {
  const text =
    decision === "renegotiate"
      ? `${approval.name} asked to renegotiate`
      : decision === "declined"
        ? `${approval.name} declined`
        : `${approval.name} approved`;
  return {
    kind: "event",
    key: `decision:${key}`,
    at,
    order: 2e6,
    round,
    event: decision === "renegotiate" ? "renegotiate" : decision === "declined" ? "declined" : "approved",
    text,
    note,
    communityId: approval.communityId,
  };
}
