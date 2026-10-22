/**
 * Same behaviour as the core helpers, used when those symbols are not exported yet.
 * Decline wins over renegotiate. Round 3 is the last deal.
 */

export type WaveApproval = {
  status: string;
  note?: string | null;
};

export type WaveDecision =
  | { action: "decline"; note: string }
  | { action: "give_up"; reason: "no agreement" }
  | { action: "renegotiate" }
  | { action: "confirm" }
  | { action: "wait" };

export function resolveApprovalWave(approvals: WaveApproval[], round: number): WaveDecision {
  const declined = approvals.filter((approval) => approval.status === "declined");
  if (declined.length > 0) {
    const notes = declined.map((approval) => approval.note?.trim() ?? "").filter((note) => note.length > 0);
    return { action: "decline", note: notes.join(" · ") || "declined" };
  }
  if (approvals.some((approval) => approval.status === "renegotiate")) {
    if (round >= 3) return { action: "give_up", reason: "no agreement" };
    return { action: "renegotiate" };
  }
  if (approvals.length > 0 && approvals.every((approval) => approval.status === "approved")) {
    return { action: "confirm" };
  }
  return { action: "wait" };
}

/** A run the approval poll may move. */
export function claimable(status: string): boolean {
  return status === "pending_approval";
}
