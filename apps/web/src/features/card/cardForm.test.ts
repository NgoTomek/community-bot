import { CardSchema, type Card } from "@community-bots/core";
import { describe, expect, it } from "vitest";
import { testCard } from "../../lib/testCards";
import {
  cardGuessCount,
  cardToDraft,
  checkDraft,
  draftGuessCount,
  draftToCard,
  idFromName,
  isBlank,
  linkLabel,
  markChecked,
  normaliseUrl,
  parseGroupSize,
  readDraftResult,
  safeHref,
  sameCard,
  stripGuess,
  type CardDraft,
} from "./cardForm";

const card: Card = testCard({
  id: "harbour-hackers",
  name: "Harbour Hackers",
  tagline: "GUESS: Weekend hack days by the docks",
  location: "Dockside",
  members: "GUESS: About 300 members",
  runs: [{ event: "Hack day", frequency: "GUESS: Monthly" }],
  offers: ["A warehouse space for 80 people", "GUESS: Mentors for first-time hackers"],
  needs: ["Sponsorship for food"],
  constraints: { days: ["Sat", "Sun"], maxGroupSize: 80, notes: null },
  tone: "Relaxed",
  sourceUrls: ["https://example.org/harbour-hackers"],
});

function edit(draft: CardDraft, patch: Partial<CardDraft>): CardDraft {
  return { ...draft, ...patch };
}

describe("GUESS helpers", () => {
  it("strips the prefix and marks a field as checked", () => {
    expect(stripGuess("GUESS: Monthly")).toBe("Monthly");
    expect(stripGuess("Monthly")).toBe("Monthly");
    expect(markChecked("GUESS: About 300 members")).toBe("About 300 members");
  });

  it("treats a bare prefix as blank", () => {
    expect(isBlank("GUESS: ")).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank("GUESS: x")).toBe(false);
  });

  it("counts guesses on cards and drafts, ignoring source links", () => {
    expect(cardGuessCount(card)).toBe(4);
    expect(cardGuessCount({ ...card, sourceUrls: ["GUESS: https://example.org"] })).toBe(4);
    const draft = cardToDraft(card);
    expect(draftGuessCount(draft)).toBe(4);
    expect(draftGuessCount(edit(draft, { members: markChecked(draft.members) }))).toBe(3);
  });
});

describe("draft and card conversion", () => {
  it("round-trips a valid card unchanged", () => {
    const back = draftToCard(cardToDraft(card), card.id);
    expect(back).toEqual(card);
    expect(CardSchema.safeParse(back).success).toBe(true);
  });

  it("turns empty text into null, trims, and keeps GUESS prefixes", () => {
    const draft = edit(cardToDraft(card), { tagline: "   ", tone: "  GUESS:   Calm  ", location: " Pier 4 " });
    const out = draftToCard(draft, card.id);
    expect(out.tagline).toBeNull();
    expect(out.tone).toBe("GUESS: Calm");
    expect(out.location).toBe("Pier 4");
  });

  it("skips blank list rows and orders days Mon to Sun", () => {
    const draft = cardToDraft(card);
    const out = draftToCard(
      edit(draft, {
        offers: [...draft.offers, { key: "blank", text: "  " }, { key: "bare", text: "GUESS: " }],
        runs: [...draft.runs, { key: "empty-run", event: "", frequency: "" }],
        days: ["Sun", "Mon"],
      }),
      card.id,
    );
    expect(out.offers).toEqual(card.offers);
    expect(out.runs).toEqual(card.runs);
    expect(out.constraints.days).toEqual(["Mon", "Sun"]);
  });

  it("parses the max group size", () => {
    expect(parseGroupSize("")).toBeNull();
    expect(parseGroupSize(" 40 ")).toBe(40);
    expect(parseGroupSize("40 people")).toBeNaN();
    expect(parseGroupSize("1.5")).toBeNaN();
  });

  it("derives new ids from the name, without the GUESS prefix", () => {
    expect(idFromName("Harbour Hackers!")).toBe("harbour-hackers");
    expect(idFromName("GUESS: Café Club")).toBe("cafe-club");
  });

  it("compares cards by content", () => {
    expect(sameCard(draftToCard(cardToDraft(card), card.id), card)).toBe(true);
    expect(sameCard({ ...card, tone: "Loud" }, card)).toBe(false);
  });
});

describe("draft validation", () => {
  it("accepts a valid draft", () => {
    const check = checkDraft(cardToDraft(card), card.id, false);
    expect(check.valid).toBe(true);
    expect(check.errors).toEqual({});
    expect(check.other).toBeNull();
  });

  it("puts readable errors on the fields that caused them", () => {
    const draft = cardToDraft(card);
    const badRun = { key: "run-x", event: "  ", frequency: "Weekly" };
    const check = checkDraft(edit(draft, { name: " ", maxGroupSize: "0", runs: [...draft.runs, badRun] }), idFromName(""), true);
    expect(check.valid).toBe(false);
    expect(check.errors.name).toMatch(/name/i);
    expect(check.errors.maxGroupSize).toMatch(/whole number/);
    expect(check.errors["run:run-x:event"]).toMatch(/Name the event/);
    expect(check.other).toBeNull();
  });

  it("maps list errors to the right row even when blank rows are skipped", () => {
    const draft = cardToDraft(card);
    const runs = [{ key: "skipped", event: "", frequency: "" }, { key: "bad", event: "GUESS: ", frequency: "Monthly" }];
    const check = checkDraft(edit(draft, { runs }), card.id, false);
    expect(Object.keys(check.errors)).toEqual(["run:bad:event"]);
  });

  it("rejects text in the group size", () => {
    const check = checkDraft(edit(cardToDraft(card), { maxGroupSize: "lots" }), card.id, false);
    expect(check.errors.maxGroupSize).toBeDefined();
  });

  it("reports problems with no field on screen through formatZodError", () => {
    const check = checkDraft(cardToDraft(card), "Not Kebab", false);
    expect(check.valid).toBe(false);
    expect(check.other).toContain("id:");
  });
});

describe("draft job results", () => {
  it("reads a valid card and its backend", () => {
    const result = readDraftResult({ backend: "mock", card });
    expect(result).toEqual({ ok: true, card, backend: "mock" });
  });

  it("coerces a loosely-shaped card", () => {
    const result = readDraftResult({ card: { name: "Loose Club", offers: "A room", constraints: { days: "weekends" } } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.id).toBe("loose-club");
      expect(result.card.offers).toEqual(["A room"]);
      expect(result.card.constraints.days).toEqual(["Sat", "Sun"]);
      expect(result.backend).toBeNull();
    }
  });

  it("explains a missing card", () => {
    expect(readDraftResult(null).ok).toBe(false);
    expect(readDraftResult({ backend: "mock" }).ok).toBe(false);
  });
});

describe("links", () => {
  it("adds https:// and validates", () => {
    expect(normaliseUrl("example.org/club")).toEqual({ url: "https://example.org/club" });
    expect(normaliseUrl(" https://lu.ma/abc ")).toEqual({ url: "https://lu.ma/abc" });
    expect("error" in normaliseUrl("")).toBe(true);
    expect("error" in normaliseUrl("not a link")).toBe(true);
    expect("error" in normaliseUrl("localhost")).toBe(true);
    expect("error" in normaliseUrl("ftp://example.org")).toBe(true);
    expect("error" in normaliseUrl("javascript:alert(1)")).toBe(true);
    expect("error" in normaliseUrl(`https://example.org/${"a".repeat(300)}`)).toBe(true);
  });

  it("only renders http(s) links", () => {
    expect(safeHref("https://example.org/a")).toBe("https://example.org/a");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });

  it("labels links without the scheme or trailing slash", () => {
    expect(linkLabel("https://www.example.org/club/")).toBe("example.org/club");
    expect(linkLabel("https://example.org")).toBe("example.org");
  });
});
