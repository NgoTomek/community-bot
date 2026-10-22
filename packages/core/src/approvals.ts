/** One community's vote in the current approval round. */
export interface ApprovalVote {
  communityId: string;
  status: string;
  note: string | null;
}

export type ApprovalWave =
  | { type: "decline"; communityId: string; reason: string }
  | { type: "give_up"; reason: string }
  | { type: "renegotiate"; notes: { communityId: string; note: string | null }[] }
  | { type: "confirm" }
  | { type: "wait" };

/** Positional form used by the worker poll: `(approvals, round)`. */
export type ApprovalAction =
  | { action: "decline"; note: string }
  | { action: "give_up"; reason: "no agreement" }
  | { action: "renegotiate" }
  | { action: "confirm" }
  | { action: "wait" };

/**
 * What to do once the communities in this round have answered, or while some are still pending.
 * A decline wins over a renegotiate. Renegotiate past maxRounds gives up.
 *
 * Object form: `{ round, rows, maxRounds? }` → `{ type, ... }`.
 * Positional form: `(rows, round)` → `{ action, ... }`, which is what the worker poll calls.
 */
export function resolveApprovalWave(input: {
  round: number;
  rows: ApprovalVote[];
  maxRounds?: number;
}): ApprovalWave;
export function resolveApprovalWave(
  approvals: { status: string; note?: string | null }[],
  round: number,
): ApprovalAction;
export function resolveApprovalWave(
  input:
    | { round: number; rows: ApprovalVote[]; maxRounds?: number }
    | { status: string; note?: string | null; communityId?: string }[],
  roundArg?: number,
): ApprovalWave | ApprovalAction {
  if (Array.isArray(input)) return actionFor(input, roundArg ?? 1);
  return waveFor(input.rows, input.round, input.maxRounds ?? 3);
}

function waveFor(rows: ApprovalVote[], round: number, maxRounds: number): ApprovalWave {
  const declined = rows.find((row) => row.status === "declined");
  if (declined) {
    return { type: "decline", communityId: declined.communityId, reason: declined.note || "" };
  }
  const renegotiating = rows.filter((row) => row.status === "renegotiate");
  if (renegotiating.length > 0) {
    if (round >= maxRounds) return { type: "give_up", reason: "no agreement" };
    return {
      type: "renegotiate",
      notes: renegotiating.map((row) => ({ communityId: row.communityId, note: row.note })),
    };
  }
  if (rows.length > 0 && rows.every((row) => row.status === "approved")) return { type: "confirm" };
  return { type: "wait" };
}

function actionFor(rows: { status: string; note?: string | null }[], round: number): ApprovalAction {
  const declined = rows.filter((row) => row.status === "declined");
  if (declined.length > 0) {
    const notes = declined.map((row) => row.note?.trim() ?? "").filter((note) => note.length > 0);
    return { action: "decline", note: notes.join(" · ") || "declined" };
  }
  if (rows.some((row) => row.status === "renegotiate")) {
    if (round >= 3) return { action: "give_up", reason: "no agreement" };
    return { action: "renegotiate" };
  }
  if (rows.length > 0 && rows.every((row) => row.status === "approved")) return { action: "confirm" };
  return { action: "wait" };
}

/** A run can be claimed for the next approval wave only while it is waiting on humans. */
export function claimable(status: string): boolean {
  return status === "pending_approval";
}
