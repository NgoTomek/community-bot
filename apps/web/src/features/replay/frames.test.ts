import { describe, expect, it } from "vitest";
import type { DealVersion, Message, Run } from "../../data/types";
import { buildTimeline } from "../../lib/timeline";
import { testDeal } from "../../lib/testCards";
import { COMPILE_DELAY_MS, OUTCOME_DELAY_MS, buildSteps, frameAt, isTerminal } from "./frames";
import type { ReplayMessage } from "./model";

const T0 = Date.parse("2026-10-19T17:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    leadId: "alpha-guild",
    need: "A robotics night",
    partnerIds: ["beta-circle"],
    backend: "mock",
    status: "confirmed",
    consensus: true,
    dealId: "d2",
    round: 2,
    declineReason: null,
    typing: null,
    error: null,
    control: "running",
    createdAt: at(0),
    ...overrides,
  };
}

function post(seq: number, seconds: number, role: Message["role"] = "bot"): ReplayMessage {
  return {
    message: {
      id: `m${seq}`,
      runId: "run-1",
      seq,
      speaker: role === "bot" ? "Beta Circle Bot" : "Alpha Guild organiser",
      communityId: role === "bot" ? "beta-circle" : "alpha-guild",
      role,
      text: `Post ${seq}`,
      stance: role === "bot" ? "offer" : null,
      evidence: null,
      createdAt: at(seconds),
    },
    delayMs: 1000 + seq,
  };
}

function deal(id: string, round: number, seconds: number): DealVersion {
  return { id, runId: "run-1", round, deal: testDeal(), status: "confirmed", createdAt: at(seconds) };
}

// Round 1: posts 0-2, deal d1 at 10s. Round 2: posts 3-4, deal d2 at 30s. Then confirmed.
const MESSAGES = [post(0, 0, "human"), post(1, 3), post(2, 6), post(3, 20), post(4, 24)];
const DEALS = [deal("d2", 2, 30), deal("d1", 1, 10)];

describe("buildSteps", () => {
  it("puts each deal after the last post written before it, and the outcome last", () => {
    const steps = buildSteps({ run: run(), messages: [...MESSAGES].reverse(), deals: DEALS });
    expect(steps.map((s) => s.key)).toEqual(["m:m0", "m:m1", "m:m2", "deal:d1", "m:m3", "m:m4", "deal:d2", "outcome"]);
    expect(steps.find((s) => s.kind === "deal")?.delayMs).toBe(COMPILE_DELAY_MS);
    expect(steps[steps.length - 1].delayMs).toBe(OUTCOME_DELAY_MS);
    expect(steps[1].delayMs).toBe(1001);
  });

  it("adds no outcome to a run that is still going", () => {
    const steps = buildSteps({ run: run({ status: "pending_approval" }), messages: MESSAGES, deals: DEALS });
    expect(steps[steps.length - 1].key).toBe("deal:d2");
  });

  it("knows which runs ended", () => {
    expect(isTerminal(run({ status: "confirmed" }))).toBe(true);
    expect(isTerminal(run({ status: "declined" }))).toBe(true);
    expect(isTerminal(run({ status: "error" }))).toBe(true);
    expect(isTerminal(run({ status: "negotiating", control: "stopped" }))).toBe(true);
    expect(isTerminal(run({ status: "negotiating", control: "paused" }))).toBe(false);
    expect(isTerminal(run({ status: "pending_approval" }))).toBe(false);
  });
});

describe("frameAt", () => {
  const steps = buildSteps({ run: run(), messages: MESSAGES, deals: DEALS });

  it("starts empty, waiting for the first post", () => {
    const frame = frameAt(steps, run(), 0);
    expect(frame.messages).toEqual([]);
    expect(frame.next?.key).toBe("m:m0");
    expect(frame.posts).toEqual({ shown: 0, total: 5 });
    expect(frame.finished).toBe(false);
  });

  it("shows 'Deal compiled' only once the replay reaches it", () => {
    const before = frameAt(steps, run(), 3);
    expect(before.deals).toEqual([]);
    expect(before.next?.kind).toBe("deal");
    const items = buildTimeline({ run: before.run, messages: before.messages, deals: before.deals, approvals: [] });
    expect(items.map((i) => i.key)).toEqual(["m:m0", "m:m1", "m:m2"]);

    const after = frameAt(steps, run(), 4);
    const withDeal = buildTimeline({ run: after.run, messages: after.messages, deals: after.deals, approvals: [] });
    expect(withDeal.map((i) => i.key)).toEqual(["m:m0", "m:m1", "m:m2", "deal:d1"]);
  });

  it("starts round 2 with its first post, not before", () => {
    const dealOnly = frameAt(steps, run(), 4);
    expect(dealOnly.run.round).toBe(1);
    const firstOfRound2 = frameAt(steps, run(), 5);
    expect(firstOfRound2.run.round).toBe(2);
    const items = buildTimeline({ run: firstOfRound2.run, messages: firstOfRound2.messages, deals: firstOfRound2.deals, approvals: [] });
    expect(items.map((i) => i.key)).toEqual(["m:m0", "m:m1", "m:m2", "deal:d1", "round:2", "m:m3"]);
  });

  it("keeps the outcome back until the end, then uses the real run", () => {
    const almost = frameAt(steps, run(), steps.length - 1);
    expect(almost.run.status).toBe("negotiating");
    const beforeEnd = buildTimeline({ run: almost.run, messages: almost.messages, deals: almost.deals, approvals: [] });
    expect(beforeEnd.some((i) => i.key === "confirmed")).toBe(false);

    const end = frameAt(steps, run(), steps.length);
    expect(end.finished).toBe(true);
    expect(end.next).toBeNull();
    expect(end.posts).toEqual({ shown: 5, total: 5 });
    expect(end.run).toMatchObject({ status: "confirmed", round: 2 });
    const items = buildTimeline({ run: end.run, messages: end.messages, deals: end.deals, approvals: [] });
    expect(items[items.length - 1].key).toBe("confirmed");
  });

  it("clamps out-of-range counts", () => {
    expect(frameAt(steps, run(), -3).posts.shown).toBe(0);
    expect(frameAt(steps, run(), 99).finished).toBe(true);
  });
});
