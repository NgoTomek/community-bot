import { messageDelayMs, type DealRow, type ExportedRun, type MessageRow } from "@community-bots/core";
import { describe, expect, it } from "vitest";
import { alpha, beta, testDeal } from "../../lib/testCards";
import { dealFromRow, messageFromRow, parseExportedRun, replayFromExported, runFromRow } from "./exported";

const RUN_AT = "2026-10-19T17:00:00.000Z";

function message(overrides: Partial<MessageRow> & { id: string; seq: number }): MessageRow {
  return {
    run_id: "run-1",
    speaker: "Alpha Guild Bot",
    community_id: "alpha-guild",
    role: "bot",
    text: "We can host in our loft.",
    stance: "offer",
    evidence: { quote: "A loft space for 40 people", verified: true, field: "offers[0]" },
    delay_ms: 1800,
    created_at: "2026-10-19T17:00:05.000Z",
    ...overrides,
  };
}

function exported(overrides: Partial<ExportedRun> = {}): ExportedRun {
  return {
    version: 1,
    exportedAt: "2026-10-22T10:00:00.000Z",
    run: {
      id: "run-1",
      lead_id: "alpha-guild",
      need: "A robotics night for 40 people",
      partner_ids: ["beta-circle"],
      backend: "mock",
      status: "confirmed",
      consensus: true,
      deal_id: "deal-1",
      round: 1,
      decline_reason: null,
      typing: "beta-circle",
      error: null,
      created_at: RUN_AT,
    },
    cards: {
      "alpha-guild": { name: "Alpha Guild", status: "confirmed", card: alpha },
      "beta-circle": { name: "Beta Circle", status: "draft", card: beta },
    },
    messages: [
      message({ id: "m2", seq: 1, community_id: "beta-circle", speaker: "Beta Circle Bot", text: "We bring speakers.", delay_ms: 0, created_at: "2026-10-19T17:00:08.000Z" }),
      message({ id: "m1", seq: 0, role: "human", speaker: "Alpha Guild organiser", stance: null, evidence: null, created_at: RUN_AT }),
    ],
    deal: { id: "deal-1", run_id: "run-1", deal: testDeal(), round: 1, status: "confirmed", created_at: "2026-10-19T17:00:12.000Z" },
    approvals: [],
    announcements: [{ deal_id: "deal-1", community_id: "alpha-guild", text: "We're teaming up with Beta Circle." }],
    ...overrides,
  };
}

describe("parseExportedRun", () => {
  it("accepts a version 1 export", () => {
    const file = exported();
    expect(parseExportedRun(JSON.parse(JSON.stringify(file)))).not.toBeNull();
    expect(parseExportedRun({ ...file, deal: null })).not.toBeNull();
  });

  it("rejects anything that cannot be replayed", () => {
    expect(parseExportedRun(null)).toBeNull();
    expect(parseExportedRun("<!doctype html>")).toBeNull();
    expect(parseExportedRun({ ...exported(), version: 2 })).toBeNull();
    expect(parseExportedRun({ ...exported(), run: { id: "x" } })).toBeNull();
    expect(parseExportedRun({ ...exported(), messages: "nope" })).toBeNull();
    expect(parseExportedRun({ ...exported(), messages: [{ id: "m", text: "hi", role: "robot" }] })).toBeNull();
    expect(parseExportedRun({ ...exported(), deal: { id: "d", deal: { title: "No date" } } })).toBeNull();
  });
});

describe("row mappers", () => {
  it("maps a run row to the web Run, never replaying a typing indicator", () => {
    const run = runFromRow(exported().run);
    expect(run).toMatchObject({
      id: "run-1",
      leadId: "alpha-guild",
      partnerIds: ["beta-circle"],
      backend: "mock",
      status: "confirmed",
      dealId: "deal-1",
      round: 1,
      declineReason: null,
      typing: null,
      control: "running",
      createdAt: RUN_AT,
    });
  });

  it("falls back to safe values for unknown backends and statuses", () => {
    const run = runFromRow({ ...exported().run, backend: "skynet", status: "dancing", round: undefined } as never);
    expect(run.backend).toBe("mock");
    expect(run.status).toBe("negotiating");
    expect(run.round).toBe(1);
  });

  it("maps a message row and keeps its stored delay", () => {
    const { message: m, delayMs } = messageFromRow(message({ id: "m1", seq: 3 }), RUN_AT);
    expect(m).toMatchObject({ id: "m1", runId: "run-1", seq: 3, communityId: "alpha-guild", role: "bot", stance: "offer", createdAt: "2026-10-19T17:00:05.000Z" });
    expect(m.evidence?.quote).toBe("A loft space for 40 people");
    expect(delayMs).toBe(1800);
  });

  it("falls back to messageDelayMs when the stored delay is missing or zero", () => {
    const text = "We bring speakers.";
    expect(messageFromRow(message({ id: "a", seq: 0, text, delay_ms: 0 }), RUN_AT).delayMs).toBe(messageDelayMs(text));
    const noDelay = { ...message({ id: "b", seq: 1, text }) } as Partial<MessageRow>;
    delete noDelay.delay_ms;
    expect(messageFromRow(noDelay as MessageRow, RUN_AT).delayMs).toBe(messageDelayMs(text));
  });

  it("gives a deal row without a round round 1", () => {
    const row = { id: "d", run_id: "run-1", deal: testDeal(), status: "confirmed", created_at: RUN_AT } as unknown as DealRow;
    expect(dealFromRow(row, RUN_AT)).toEqual({ id: "d", runId: "run-1", round: 1, deal: testDeal(), status: "confirmed", createdAt: RUN_AT });
  });
});

describe("replayFromExported", () => {
  it("builds a replay in seq order with cards, names and statuses", () => {
    const data = replayFromExported(exported());
    expect(data.origin).toBe("file");
    expect(data.messages.map((m) => m.message.id)).toEqual(["m1", "m2"]);
    expect(data.messages[1].delayMs).toBe(messageDelayMs("We bring speakers."));
    expect(data.deals.map((d) => [d.id, d.round])).toEqual([["deal-1", 1]]);
    expect(data.communities).toEqual([
      { id: "alpha-guild", name: "Alpha Guild", status: "confirmed" },
      { id: "beta-circle", name: "Beta Circle", status: "draft" },
    ]);
    expect(Object.keys(data.cards).sort()).toEqual(["alpha-guild", "beta-circle"]);
    expect(data.names["beta-circle"]).toBe("Beta Circle");
    expect(data.announcements).toEqual([{ dealId: "deal-1", communityId: "alpha-guild", text: "We're teaming up with Beta Circle." }]);
  });

  it("drops cards that do not parse and still names the community", () => {
    const file = exported({ cards: { "alpha-guild": { name: "Alpha Guild", status: "confirmed", card: { broken: true } as never } } });
    const data = replayFromExported(file);
    expect(data.cards["alpha-guild"]).toBeUndefined();
    expect(data.names["alpha-guild"]).toBe("Alpha Guild");
    // Beta has no card in the file: its name comes from the deal, its status is unknown.
    expect(data.communities[1]).toEqual({ id: "beta-circle", name: "Beta Circle", status: null });
  });

  it("replays a run without a deal", () => {
    const data = replayFromExported(exported({ deal: null, announcements: [] }));
    expect(data.deals).toEqual([]);
  });
});
