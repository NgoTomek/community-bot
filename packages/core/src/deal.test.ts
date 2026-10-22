import { describe, expect, it } from "vitest";
import { validateDeal } from "./deal";
import { addDays, nextAllowedDate, todayIso } from "./dates";
import type { Card, Day, Deal } from "./schemas";

const now = new Date();
const today = todayIso(now);
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);

function onDay(day: Day): string {
  const date = nextAllowedDate(tomorrow, [day]);
  if (!date) throw new Error(`no ${day} on or after ${tomorrow}`);
  return date;
}

function makeCard(
  partial: Partial<Omit<Card, "constraints">> & Pick<Card, "id" | "name"> & { constraints?: Partial<Card["constraints"]> },
): Card {
  const { constraints, ...rest } = partial;
  return {
    tagline: null,
    location: null,
    members: null,
    runs: [],
    offers: ["a projector"],
    needs: [],
    tone: null,
    sourceUrls: [`https://example.test/${partial.id}`],
    ...rest,
    constraints: { days: [], maxGroupSize: null, notes: null, ...constraints },
  };
}

const river = makeCard({ id: "river-club", name: "River Club", offers: ["venue space"] });
const cedar = makeCard({ id: "cedar-circle", name: "Cedar Circle", offers: ["guest speakers"] });

function rawDeal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Joint mixer",
    date: tomorrow,
    time: "18:30",
    venue: "Dockside Hall",
    capacity: 30,
    description: "A small joint mixer for both groups.",
    communities: [
      { id: "river-club", name: "WRONG", role: "host", brings: ["venue"] },
      { id: "cedar-circle", name: "ALSO WRONG", role: "audience", brings: ["speakers"] },
    ],
    agenda: [{ time: "18:30", item: "Doors" }],
    reasons: [],
    consensus: true,
    status: "pending_approval",
    ...overrides,
  };
}

function expectOk(raw: Record<string, unknown>, cards: Card[] = [river, cedar]) {
  const result = validateDeal(raw, { cards, leadId: "river-club", now });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  return result;
}

function expectErrors(raw: Record<string, unknown>, cards: Card[] = [river, cedar]) {
  const result = validateDeal(raw, { cards, leadId: "river-club", now });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected errors");
  return result.errors;
}

describe("validateDeal date", () => {
  it("rejects today and the past, accepts tomorrow", () => {
    expect(expectErrors(rawDeal({ date: today })).some((e) => e.includes(`must be after today (${today})`))).toBe(true);
    expect(expectErrors(rawDeal({ date: yesterday })).some((e) => e.includes("must be after today"))).toBe(true);
    expect(expectOk(rawDeal({ date: tomorrow })).ok).toBe(true);
  });

  it("rejects invalid calendar dates such as Feb 30", () => {
    const impossible = `${today.slice(0, 4)}-02-30`;
    const errors = expectErrors(rawDeal({ date: impossible }));
    expect(errors.some((e) => e.includes(`${impossible} is not a real calendar date`))).toBe(true);
    expect(errors.some((e) => e.includes("must be after today"))).toBe(false);
  });

  it("requires a weekday allowed by every involved community; empty days are no restriction", () => {
    const riverWed = makeCard({ id: "river-club", name: "River Club", constraints: { days: ["Mon", "Wed"] } });
    const cedarOpen = makeCard({ id: "cedar-circle", name: "Cedar Circle", constraints: { days: [] } });
    const cards = [riverWed, cedarOpen];
    const wednesday = onDay("Wed");
    const fridayDate = onDay("Fri");
    expect(validateDeal(rawDeal({ date: wednesday }), { cards, leadId: "river-club", now }).ok).toBe(true);

    const friday = validateDeal(rawDeal({ date: fridayDate }), { cards, leadId: "river-club", now });
    expect(friday.ok).toBe(false);
    if (friday.ok) throw new Error("expected errors");
    expect(friday.errors.join(" ")).toMatch(new RegExp(`${fridayDate} is a Fri, not allowed by River Club`));
    expect(friday.errors.join(" ")).toMatch(/allowed days for everyone: Mon, Wed/);
  });

  it("errors when there is no overlapping weekday", () => {
    const cards = [
      makeCard({ id: "river-club", name: "River Club", constraints: { days: ["Mon"] } }),
      makeCard({ id: "cedar-circle", name: "Cedar Circle", constraints: { days: ["Tue"] } }),
    ];
    const errors = validateDeal(rawDeal({ date: tomorrow }), { cards, leadId: "river-club", now });
    expect(errors.ok).toBe(false);
    if (errors.ok) throw new Error("expected errors");
    expect(errors.errors.join(" ")).toMatch(/no weekday is allowed by every involved community/);
  });
});

describe("validateDeal capacity", () => {
  it("rejects capacity above any set maxGroupSize and ignores null max", () => {
    const cards = [
      makeCard({ id: "river-club", name: "River Club", constraints: { maxGroupSize: null } }),
      makeCard({ id: "cedar-circle", name: "Cedar Circle", constraints: { maxGroupSize: 20 } }),
    ];
    expect(validateDeal(rawDeal({ capacity: 20 }), { cards, leadId: "river-club", now }).ok).toBe(true);
    const over = validateDeal(rawDeal({ capacity: 21 }), { cards, leadId: "river-club", now });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error("expected errors");
    expect(over.errors.join(" ")).toMatch(/capacity: 21 exceeds Cedar Circle's maxGroupSize of 20/);
  });
});

describe("validateDeal communities", () => {
  it("rejects unknown and duplicate ids, a missing lead, and a missing host", () => {
    const unknown = expectErrors(rawDeal({
      communities: [
        { id: "river-club", name: "River Club", role: "host", brings: ["venue"] },
        { id: "ghost-guild", name: "Ghost", role: "audience", brings: ["x"] },
      ],
    }));
    expect(unknown.join(" ")).toMatch(/unknown id\(s\) ghost-guild/);
    expect(unknown.join(" ")).toMatch(/use only river-club, cedar-circle/);

    const dup = expectErrors(rawDeal({
      communities: [
        { id: "river-club", name: "River Club", role: "host", brings: ["venue"] },
        { id: "river-club", name: "River Club", role: "audience", brings: ["x"] },
      ],
    }));
    expect(dup.join(" ")).toMatch(/each community may appear only once/);

    const noLead = validateDeal(rawDeal({
      communities: [
        { id: "cedar-circle", name: "Cedar Circle", role: "host", brings: ["x"] },
        { id: "harbour-lights", name: "Harbour Lights", role: "audience", brings: ["y"] },
      ],
    }), {
      cards: [river, cedar, makeCard({ id: "harbour-lights", name: "Harbour Lights" })],
      leadId: "river-club",
      now,
    });
    expect(noLead.ok).toBe(false);
    if (noLead.ok) throw new Error("expected errors");
    expect(noLead.errors.join(" ")).toMatch(/the lead community river-club must be included/);

    const noHost = expectErrors(rawDeal({
      communities: [
        { id: "river-club", name: "River Club", role: "co-host", brings: ["venue"] },
        { id: "cedar-circle", name: "Cedar Circle", role: "audience", brings: ["x"] },
      ],
    }));
    expect(noHost.join(" ")).toMatch(/one community must have role 'host'/);
  });

  it("overwrites names from the cards", () => {
    const result = expectOk(rawDeal());
    expect(result.deal.communities.map((c) => c.name)).toEqual(["River Club", "Cedar Circle"]);
  });
});

describe("validateDeal reasons", () => {
  it("drops unverified reasons and keeps valid ones", () => {
    const result = expectOk(rawDeal({
      reasons: [
        { communityId: "river-club", evidence: "venue space" },
        { communityId: "river-club", evidence: "not written anywhere" },
        { communityId: "cedar-circle", evidence: "guest speakers" },
        { communityId: "ghost-guild", evidence: "venue space" },
      ],
    }));
    expect(result.deal.reasons).toEqual([
      { communityId: "river-club", evidence: "venue space" },
      { communityId: "cedar-circle", evidence: "guest speakers" },
    ]);
    expect(result.droppedReasons).toEqual([
      { communityId: "river-club", evidence: "not written anywhere" },
      { communityId: "ghost-guild", evidence: "venue space" },
    ]);
  });
});

describe("validateDeal schema failures", () => {
  it("returns zod errors when the payload is not a deal", () => {
    const result = validateDeal({ title: "x" }, { cards: [river, cedar], leadId: "river-club", now });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors.length).toBe(1);
  });
});

describe("Deal type smoke", () => {
  it("returns a Deal on success", () => {
    const result = expectOk(rawDeal());
    const deal: Deal = result.deal;
    expect(deal.status).toBe("pending_approval");
  });
});
