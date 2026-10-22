import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUSES,
  DEAL_STATUSES,
  DealSchema,
  JOB_PUBLIC_COLUMNS,
  JOB_TYPES,
  LIMITS,
  PublishLumaParamsSchema,
  RenegotiateParamsSchema,
  formatZodError,
  type ApprovalRow,
  type CommunityRow,
  type JobRow,
  type RunRow,
} from "./schemas";

function validDeal(overrides: Record<string, unknown> = {}) {
  return {
    title: "Joint mixer",
    date: "2026-03-20",
    time: "18:30",
    venue: "Dockside Hall",
    capacity: 40,
    description: "A small joint mixer for both groups.",
    communities: [
      { id: "river-club", name: "River Club", role: "host", brings: ["venue"] },
      { id: "cedar-circle", name: "Cedar Circle", role: "audience", brings: ["speakers"] },
    ],
    agenda: [{ time: "18:30", item: "Doors" }],
    reasons: [],
    consensus: true,
    status: "pending_approval",
    ...overrides,
  };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("DealSchema", () => {
  it("accepts a valid deal", () => {
    expect(DealSchema.parse(validDeal()).status).toBe("pending_approval");
  });

  it("caps description at 40 words", () => {
    expect(DealSchema.safeParse(validDeal({ description: words(40) })).success).toBe(true);
    const over = DealSchema.safeParse(validDeal({ description: words(41) }));
    expect(over.success).toBe(false);
    if (over.success) throw new Error("expected failure");
    expect(formatZodError(over.error)).toMatch(/description must be at most 40 words/);
  });

  it("requires time as HH:MM 24h", () => {
    expect(DealSchema.safeParse(validDeal({ time: "00:00" })).success).toBe(true);
    expect(DealSchema.safeParse(validDeal({ time: "23:59" })).success).toBe(true);
    expect(DealSchema.safeParse(validDeal({ time: "24:00" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ time: "7:00" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ time: "23:60" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ time: "18:30:00" })).success).toBe(false);
  });

  it("requires date as YYYY-MM-DD (format only)", () => {
    expect(DealSchema.safeParse(validDeal({ date: "2026-03-20" })).success).toBe(true);
    expect(DealSchema.safeParse(validDeal({ date: "2026-3-20" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ date: "20-03-2026" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ date: "2026-02-30" })).success).toBe(true);
  });

  it("requires status to be the literal pending_approval", () => {
    expect(DealSchema.safeParse(validDeal({ status: "confirmed" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ status: "changes_requested" })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ status: "pending_approval" })).success).toBe(true);
  });

  it("requires capacity to be a positive integer", () => {
    expect(DealSchema.safeParse(validDeal({ capacity: 1 })).success).toBe(true);
    expect(DealSchema.safeParse(validDeal({ capacity: 0 })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ capacity: -1 })).success).toBe(false);
    expect(DealSchema.safeParse(validDeal({ capacity: 1.5 })).success).toBe(false);
  });

  it("requires at least two communities and one agenda item", () => {
    const oneCommunity = validDeal({
      communities: [{ id: "river-club", name: "River Club", role: "host", brings: ["venue"] }],
    });
    const noAgenda = validDeal({ agenda: [] });
    expect(DealSchema.safeParse(oneCommunity).success).toBe(false);
    expect(DealSchema.safeParse(noAgenda).success).toBe(false);
    const one = DealSchema.safeParse(oneCommunity);
    if (one.success) throw new Error("expected failure");
    expect(formatZodError(one.error)).toMatch(/at least two communities/);
  });
});

type Has<T, K extends string> = K extends keyof T ? true : false;
type NotHas<T, K extends string> = Has<T, K> extends true ? false : true;
function assert<_T extends true>(): true {
  return true;
}

describe("live database contract", () => {
  it("matches job types, limits, and public columns", () => {
    expect(JOB_TYPES).toEqual(["draft_card", "match", "negotiate", "renegotiate", "publish_luma"]);
    expect(JOB_TYPES).not.toContain("confirm_card");
    expect(LIMITS).toEqual({
      url: 300,
      need: 600,
      name: 80,
      maxPartners: 3,
      note: 2000,
      rsvpName: 60,
      maxBotMessages: 12,
      maxRounds: 3,
      maxRsvps: 200,
      paramsBytes: 20000,
      maxQueuedJobs: 30,
    });
    expect(JOB_PUBLIC_COLUMNS).toBe("id,type,params,status,progress,result,error,created_at,claimed_at");
    expect(DEAL_STATUSES).toEqual(["pending_approval", "confirmed", "declined"]);
    expect(APPROVAL_STATUSES).toEqual(["pending", "approved", "declined", "renegotiate"]);
    expect(RenegotiateParamsSchema.safeParse({ runId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(RenegotiateParamsSchema.safeParse({ runId: "nope" }).success).toBe(false);
    expect(PublishLumaParamsSchema.safeParse({ dealId: "00000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(assert<Has<JobRow, "claimed_at">>()).toBe(true);
    expect(assert<NotHas<JobRow, "passcode">>()).toBe(true);
    expect(assert<NotHas<CommunityRow, "backend">>()).toBe(true);
    expect(assert<NotHas<RunRow, "match">>()).toBe(true);
    expect(assert<Has<RunRow, "round">>()).toBe(true);
    expect(assert<Has<RunRow, "decline_reason">>()).toBe(true);
    expect(assert<Has<ApprovalRow, "run_id">>()).toBe(true);
    expect(assert<Has<ApprovalRow, "quick_reasons">>()).toBe(true);
    expect(assert<Has<ApprovalRow, "history">>()).toBe(true);
  });
});
