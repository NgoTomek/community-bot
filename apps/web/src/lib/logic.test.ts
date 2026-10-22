import { describe, expect, it } from "vitest";
import type { Run } from "../data/types";
import { allChecksPass, checkDealConstraints } from "./constraints";
import { diffDeals, summarizeDiff } from "./dealDiff";
import { checkQuote, countVerified } from "./evidence";
import { classifyRun, groupByLane, needsYouRunIds } from "./lanes";
import { buildTimeline } from "./timeline";
import { buildWallPosts, categorize, filterWall, needFromPost } from "./wall";
import { alpha, beta, testDeal } from "./testCards";

const NOW = new Date("2026-10-22T10:00:00Z");

function run(overrides: Partial<Run>): Run {
  return {
    id: "r",
    leadId: "alpha-guild",
    need: "A robotics night",
    partnerIds: ["beta-circle"],
    backend: "mock",
    status: "negotiating",
    consensus: null,
    dealId: null,
    round: 1,
    declineReason: null,
    typing: null,
    error: null,
    control: "running",
    createdAt: "2026-10-22T09:00:00Z",
    ...overrides,
  };
}

describe("lane classification", () => {
  it("puts each run status in its lane", () => {
    expect(classifyRun(run({ status: "matching" }))).toBe("negotiating");
    expect(classifyRun(run({ status: "negotiating" }))).toBe("negotiating");
    expect(classifyRun(run({ status: "compiling" }))).toBe("negotiating");
    expect(classifyRun(run({ status: "pending_approval" }))).toBe("waiting");
    expect(classifyRun(run({ status: "confirmed" }))).toBe("confirmed");
    expect(classifyRun(run({ status: "declined" }))).toBe("ended");
    expect(classifyRun(run({ status: "error" }))).toBe("ended");
  });

  it("ends stopped runs whatever their status", () => {
    expect(classifyRun(run({ status: "negotiating", control: "stopped" }))).toBe("ended");
    expect(classifyRun(run({ status: "pending_approval", control: "paused" }))).toBe("waiting");
  });

  it("groups newest first and finds runs that need you", () => {
    const lanes = groupByLane([
      run({ id: "old", createdAt: "2026-10-01T00:00:00Z" }),
      run({ id: "new", createdAt: "2026-10-20T00:00:00Z" }),
      run({ id: "done", status: "confirmed" }),
    ]);
    expect(lanes.negotiating.map((r) => r.id)).toEqual(["new", "old"]);
    expect(lanes.confirmed.map((r) => r.id)).toEqual(["done"]);
    const ids = needsYouRunIds([
      { token: "t1", status: "pending", round: 1, dealId: "d1", title: "", date: "", updatedAt: "", runId: "new" },
      { token: "t2", status: "approved", round: 1, dealId: "d2", title: "", date: "", updatedAt: "", runId: "done" },
    ]);
    expect([...ids]).toEqual(["new"]);
  });
});

describe("deal diff", () => {
  it("reports nothing without a previous round", () => {
    expect(diffDeals(null, testDeal()).count).toBe(0);
  });

  it("finds changed fields, contributions and agenda items", () => {
    const before = testDeal();
    const after = testDeal({
      time: "17:30",
      capacity: 30,
      communities: [
        { id: "alpha-guild", name: "Alpha Guild", role: "host", brings: ["A loft space for 40 people", "Volunteer hosts"] },
        { id: "beta-circle", name: "Beta Circle", role: "co-host", brings: ["Speakers on robotics and AI"] },
      ],
      agenda: [
        { time: "17:30", item: "Doors open" },
        { time: "19:00", item: "Talks" },
      ],
    });
    const diff = diffDeals(before, after);
    expect(diff.fields.time).toEqual({ before: "18:30", after: "17:30" });
    expect(diff.fields.capacity).toEqual({ before: "40", after: "30" });
    expect(diff.fields.date).toBeUndefined();
    expect(diff.communities.changed["alpha-guild"].addedBrings).toEqual(["Volunteer hosts"]);
    expect(diff.communities.changed["beta-circle"].role).toEqual({ before: "speaker", after: "co-host" });
    expect(diff.agenda.added).toEqual(["17:30 Doors open"]);
    expect(diff.agenda.removed).toEqual(["18:30 Doors open"]);
    expect(summarizeDiff(diff)).toBe("time, capacity, 2 contributions and 1 agenda item changed");
  });

  it("ignores whitespace and case", () => {
    expect(diffDeals(testDeal(), testDeal({ venue: "  alpha guild   LOFT " })).count).toBe(0);
  });
});

describe("constraint checks", () => {
  const cards = { "alpha-guild": alpha, "beta-circle": beta };

  it("passes when the weekday and size fit every card", () => {
    const checks = checkDealConstraints(testDeal(), cards, NOW);
    expect(allChecksPass(checks)).toBe(true);
    expect(checks.find((c) => c.id === "day:alpha-guild")?.label).toBe("Thursday works for Alpha Guild");
    expect(checks.find((c) => c.id === "day:beta-circle")?.unknown).toBe(true);
  });

  it("fails on a day a community cannot do and on capacity over a max", () => {
    const checks = checkDealConstraints(testDeal({ date: "2026-11-21", capacity: 55 }), cards, NOW);
    const day = checks.find((c) => c.id === "day:alpha-guild")!;
    const cap = checks.find((c) => c.id === "cap:alpha-guild")!;
    expect(day.ok).toBe(false);
    expect(day.label).toContain("Saturday is not a day Alpha Guild can do");
    expect(cap.ok).toBe(false);
    expect(cap.label).toBe("55 people is over Alpha Guild's max of 40");
    expect(checks.find((c) => c.id === "cap:beta-circle")?.ok).toBe(true);
  });

  it("fails a date in the past", () => {
    const checks = checkDealConstraints(testDeal({ date: "2026-10-01" }), cards, NOW);
    expect(checks.find((c) => c.kind === "date")?.ok).toBe(false);
  });
});

describe("evidence chip recomputation", () => {
  const cards = { "alpha-guild": alpha, "beta-circle": beta };

  it("verifies a quote on the speaker's own card and highlights it", () => {
    const result = checkQuote("loft space for 40", "alpha-guild", cards);
    expect(result.status).toBe("verified");
    expect(result.field).toBe("offers[0]");
    expect(result.segments.find((s) => s.highlight)?.text).toBe("loft space for 40");
  });

  it("finds a quote on another participant's card", () => {
    const result = checkQuote("Speakers on robotics and AI", "alpha-guild", cards);
    expect(result.status).toBe("verified");
    expect(result.ownerId).toBe("beta-circle");
  });

  it("never trusts a stored flag: an invented quote is unverified", () => {
    const stored = { quote: "Free pizza for 500 guests", verified: true, field: "offers[0]" };
    expect(checkQuote(stored.quote, "alpha-guild", cards).status).toBe("unverified");
  });

  it("handles missing quotes and missing cards", () => {
    expect(checkQuote(null, "alpha-guild", cards).status).toBe("none");
    expect(checkQuote("anything", "alpha-guild", {}).status).toBe("no-card");
    expect(countVerified([{ quote: "Volunteer hosts", ownerId: "alpha-guild" }, { quote: "made up claim", ownerId: "alpha-guild" }, { quote: null, ownerId: null }], cards)).toEqual({ verified: 1, total: 2 });
  });
});

describe("offers and needs wall", () => {
  const communities = [
    { id: "alpha-guild", name: "Alpha Guild", status: "confirmed" as const, card: alpha, sourceUrls: [], updatedAt: "" },
    { id: "beta-circle", name: "Beta Circle", status: "draft" as const, card: beta, sourceUrls: [], updatedAt: "" },
  ];

  it("categorises card text", () => {
    expect(categorize("A loft space for 40 people")).toEqual(["space"]);
    expect(categorize("Speakers on robotics")).toEqual(["speakers"]);
    expect(categorize("A newsletter with 900 readers")).toEqual(["audience"]);
    expect(categorize("Sponsorship for pizza")).toEqual(["sponsorship"]);
  });

  it("interleaves communities, strips GUESS and filters", () => {
    const posts = buildWallPosts(communities);
    expect(posts.slice(0, 2).map((p) => p.communityId)).toEqual(["alpha-guild", "beta-circle"]);
    const guess = posts.find((p) => p.guess)!;
    expect(guess.text).toBe("A newsletter with 900 readers");
    expect(filterWall(posts, "space").every((p) => p.categories.includes("space"))).toBe(true);
    expect(filterWall(posts, "all", "beta").every((p) => p.communityId === "beta-circle")).toBe(true);
    const need = posts.find((p) => p.kind === "need")!;
    expect(needFromPost(need)).toBe(need.text);
  });
});

describe("timeline", () => {
  it("adds round, deal, renegotiation and confirmation events in order", () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 22, 9, min)).toISOString();
    const message = (seq: number, min: number) => ({
      id: `m${seq}`,
      runId: "r",
      seq,
      speaker: "Alpha Guild Bot",
      communityId: "alpha-guild",
      role: "bot" as const,
      text: "hi",
      stance: null,
      evidence: null,
      createdAt: t(min),
    });
    const items = buildTimeline({
      run: run({ round: 2, status: "confirmed" }),
      messages: [message(1, 1), message(2, 2), message(3, 10)],
      deals: [
        { id: "d1", runId: "r", round: 1, deal: testDeal(), status: "changes_requested", createdAt: t(3) },
        { id: "d2", runId: "r", round: 2, deal: testDeal({ capacity: 30 }), status: "confirmed", createdAt: t(11) },
      ],
      approvals: [
        {
          communityId: "beta-circle",
          name: "Beta Circle",
          status: "approved",
          note: null,
          round: 2,
          history: [
            { round: 1, decision: "renegotiate", note: "Smaller please", at: t(5) },
            { round: 2, decision: "approved", note: null, at: t(12) },
          ],
        },
      ],
    });
    const labels = items.map((i) => (i.kind === "message" ? `msg${i.message.seq}/r${i.round}` : i.text));
    expect(labels).toEqual([
      "msg1/r1",
      "msg2/r1",
      "Deal compiled",
      "Beta Circle asked to renegotiate",
      "Round 2 started",
      "msg3/r2",
      "Deal compiled for round 2",
      "Beta Circle approved",
      "Everyone approved. The collab is confirmed.",
    ]);
  });
});
