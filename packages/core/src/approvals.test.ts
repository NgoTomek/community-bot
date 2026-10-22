import { describe, expect, it } from "vitest";
import { claimable, resolveApprovalWave, type ApprovalVote } from "./approvals";

const vote = (communityId: string, status: string, note: string | null = null): ApprovalVote => ({
  communityId,
  status,
  note,
});

/** Only the first claim of a pending_approval run moves it on. A second call is a no-op. */
function claimTransition(state: { status: string }, next: string): boolean {
  if (!claimable(state.status)) return false;
  state.status = next;
  return true;
}

describe("resolveApprovalWave", () => {
  it("waits while any row is still pending", () => {
    expect(
      resolveApprovalWave({
        round: 1,
        rows: [vote("north", "approved"), vote("south", "pending"), vote("east", "approved")],
      }),
    ).toEqual({ type: "wait" });
    expect(resolveApprovalWave({ round: 1, rows: [vote("north", "pending"), vote("south", "pending")] })).toEqual({
      type: "wait",
    });
    expect(resolveApprovalWave({ round: 1, rows: [] })).toEqual({ type: "wait" });
  });

  it("confirms when every community has approved", () => {
    expect(
      resolveApprovalWave({
        round: 2,
        rows: [vote("north", "approved"), vote("south", "approved")],
      }),
    ).toEqual({ type: "confirm" });
  });

  it("ends the run when anyone declines", () => {
    expect(
      resolveApprovalWave({
        round: 1,
        rows: [vote("north", "approved"), vote("south", "declined", "Too late for us")],
      }),
    ).toEqual({ type: "decline", communityId: "south", reason: "Too late for us" });
    expect(resolveApprovalWave({ round: 1, rows: [vote("south", "declined", null)] })).toEqual({
      type: "decline",
      communityId: "south",
      reason: "",
    });
  });

  it("renegotiates at round 1 and gives up once the round reaches the cap", () => {
    expect(
      resolveApprovalWave({
        round: 1,
        rows: [vote("north", "approved"), vote("south", "renegotiate", "Move it to Thursday")],
      }),
    ).toEqual({
      type: "renegotiate",
      notes: [{ communityId: "south", note: "Move it to Thursday" }],
    });
    expect(
      resolveApprovalWave({
        round: 2,
        rows: [vote("south", "renegotiate", "Still no")],
      }).type,
    ).toBe("renegotiate");
    expect(
      resolveApprovalWave({
        round: 3,
        rows: [vote("south", "renegotiate", "Still no")],
      }),
    ).toEqual({ type: "give_up", reason: "no agreement" });
    expect(
      resolveApprovalWave({
        round: 4,
        rows: [vote("north", "renegotiate", null), vote("south", "approved")],
      }),
    ).toEqual({ type: "give_up", reason: "no agreement" });
  });

  it("lets a decline beat a renegotiate", () => {
    expect(
      resolveApprovalWave({
        round: 1,
        rows: [vote("north", "renegotiate", "Different date"), vote("south", "declined", "We are out")],
      }),
    ).toEqual({ type: "decline", communityId: "south", reason: "We are out" });
  });
});

describe("claimable", () => {
  it("is true only for pending_approval", () => {
    expect(claimable("pending_approval")).toBe(true);
    expect(claimable("negotiating")).toBe(false);
    expect(claimable("declined")).toBe(false);
    expect(claimable("confirmed")).toBe(false);
  });

  it("transitions a claimable run once and ignores the second call", () => {
    const state = { status: "pending_approval" };
    expect(claimTransition(state, "confirmed")).toBe(true);
    expect(state.status).toBe("confirmed");
    expect(claimTransition(state, "declined")).toBe(false);
    expect(state.status).toBe("confirmed");

    for (const status of ["negotiating", "declined", "confirmed"]) {
      const stuck = { status };
      expect(claimTransition(stuck, "confirmed")).toBe(false);
      expect(stuck.status).toBe(status);
    }
  });
});
