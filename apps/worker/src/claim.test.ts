import { describe, expect, it } from "vitest";
import { claimable, resolveApprovalWave } from "./wave";
import { claimedJob } from "./loop";

describe("resolveApprovalWave", () => {
  it("lets a decline win over renegotiate", () => {
    expect(
      resolveApprovalWave(
        [
          { status: "renegotiate", note: "change the date" },
          { status: "declined", note: "we are out" },
        ],
        1,
      ),
    ).toEqual({ action: "decline", note: "we are out" });
  });

  it("still declines on the last round", () => {
    expect(resolveApprovalWave([{ status: "declined", note: "too late" }, { status: "renegotiate", note: "move it" }], 3)).toEqual({
      action: "decline",
      note: "too late",
    });
  });

  it("gives up when someone wants changes on round 3", () => {
    expect(resolveApprovalWave([{ status: "approved" }, { status: "renegotiate", note: "later" }], 3)).toEqual({
      action: "give_up",
      reason: "no agreement",
    });
  });

  it("renegotiates before the cap", () => {
    expect(resolveApprovalWave([{ status: "approved" }, { status: "renegotiate", note: "smaller room" }], 2)).toEqual({
      action: "renegotiate",
    });
  });

  it("confirms only when every approval is approved", () => {
    expect(resolveApprovalWave([{ status: "approved" }, { status: "approved" }], 3)).toEqual({ action: "confirm" });
    expect(resolveApprovalWave([{ status: "approved" }, { status: "pending" }], 1)).toEqual({ action: "wait" });
    expect(resolveApprovalWave([], 1)).toEqual({ action: "wait" });
  });
});

describe("claimable", () => {
  it("is only pending_approval", () => {
    expect(claimable("pending_approval")).toBe(true);
    expect(claimable("negotiating")).toBe(false);
    expect(claimable("confirmed")).toBe(false);
  });
});

describe("claimedJob", () => {
  it("treats null as an empty queue and keeps id, type, and params", () => {
    expect(claimedJob(null)).toBeNull();
    expect(claimedJob({ id: "job-1", type: "match", params: { leadId: "atlas" } })).toEqual({
      id: "job-1",
      type: "match",
      params: { leadId: "atlas" },
    });
  });
});
