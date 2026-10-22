import { describe, expect, it } from "vitest";
import {
  checkEvidence,
  findEvidenceField,
  flattenCard,
  flattenCardEntries,
  getCardField,
  highlightQuote,
  normaliseText,
  verifyEvidence,
} from "./evidence";
import type { Card } from "./schemas";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "river-club",
    name: "River Club",
    tagline: "We host founders nights",
    location: "Dockside Hall",
    members: "about 80",
    runs: [
      { event: "Friday social", frequency: "weekly" },
      { event: "Spring picnic", frequency: null },
    ],
    offers: ["venue space", "a projector"],
    needs: ["guest speakers"],
    constraints: { days: ["Fri"], maxGroupSize: 40, notes: "no loud music after 10" },
    tone: "warm",
    sourceUrls: ["https://example.test/river"],
    ...overrides,
  };
}

describe("normaliseText", () => {
  it("lowercases and collapses whitespace, newlines and NBSP", () => {
    expect(normaliseText("Hello\n\n  World")).toBe("hello world");
    expect(normaliseText("hello\u00a0world")).toBe("hello world");
  });

  it("drops quote characters and turns dashes and ellipsis into ASCII", () => {
    expect(normaliseText("Founders’ nights")).toBe("founders nights");
    expect(normaliseText("10–12 or 10—12")).toBe("10-12 or 10-12");
    expect(normaliseText("wait…")).toBe("wait...");
  });
});

describe("verifyEvidence", () => {
  const c = card();

  it("matches case-insensitively", () => {
    expect(verifyEvidence("FOUNDERS NIGHTS", c)).toBe(true);
    expect(verifyEvidence("dockside hall", c)).toBe(true);
  });

  it("collapses whitespace, newlines and NBSP", () => {
    expect(verifyEvidence("no   loud\nmusic\tafter 10", c)).toBe(true);
    expect(verifyEvidence("no\u00a0loud music after 10", c)).toBe(true);
  });

  it("treats curly and straight quotes as the same", () => {
    const quoted = card({ tagline: "Founders’ nights" });
    expect(verifyEvidence("Founders' nights", quoted)).toBe(true);
    expect(verifyEvidence("“Founders’ nights”", quoted)).toBe(true);
  });

  it("treats en/em dashes as hyphens", () => {
    const dashed = card({ members: "groups of 10–12" });
    expect(verifyEvidence("10-12", dashed)).toBe(true);
    expect(verifyEvidence("10—12", dashed)).toBe(true);
  });

  it("accepts quotes wrapped in quotation marks and trailing punctuation/ellipsis", () => {
    expect(verifyEvidence("“venue space.”", c)).toBe(true);
    expect(verifyEvidence("guest speakers...", c)).toBe(true);
    expect(verifyEvidence("…Friday social…", c)).toBe(true);
    expect(verifyEvidence("warm!", c)).toBe(true);
  });

  it("is true for a quote that spans two adjacent card fields (flattenCard joins with newlines)", () => {
    // flattenCard joins "a projector" and "guest speakers" with a newline → one space after normalisation.
    expect(verifyEvidence("a projector guest speakers", c)).toBe(true);
    expect(verifyEvidence("a projector\nguest speakers", c)).toBe(true);
    expect(flattenCard(c)).toContain("a projector\nguest speakers");
  });

  it("rejects quotes shorter than 3 characters after normalisation", () => {
    expect(verifyEvidence("80", c)).toBe(false);
    expect(verifyEvidence("ab", c)).toBe(false);
    expect(verifyEvidence("ab!!!", c)).toBe(false);
    expect(verifyEvidence("...", c)).toBe(false);
    expect(verifyEvidence("hi.", c)).toBe(false);
  });

  it("rejects null, undefined and empty quotes", () => {
    expect(verifyEvidence(null, c)).toBe(false);
    expect(verifyEvidence(undefined, c)).toBe(false);
    expect(verifyEvidence("", c)).toBe(false);
    expect(verifyEvidence("   ", c)).toBe(false);
  });

  it("still verifies GUESS-prefixed card values", () => {
    const guessed = card({ members: "GUESS: about 80 regulars", offers: ["GUESS: they have a projector"] });
    expect(verifyEvidence("about 80 regulars", guessed)).toBe(true);
    expect(verifyEvidence("GUESS: they have a projector", guessed)).toBe(true);
    expect(verifyEvidence("they have a projector", guessed)).toBe(true);
  });

  it("is false when the quote is not on the card", () => {
    expect(verifyEvidence("secret rooftop terrace", c)).toBe(false);
  });
});

describe("findEvidenceField + getCardField", () => {
  const c = card();

  it("returns paths like offers[1], runs[0].event, constraints.notes", () => {
    expect(findEvidenceField("a projector", c)).toBe("offers[1]");
    expect(findEvidenceField("Friday social", c)).toBe("runs[0].event");
    expect(findEvidenceField("no loud music after 10", c)).toBe("constraints.notes");
  });

  it("round-trips through getCardField", () => {
    const cases = [
      ["a projector", "offers[1]"],
      ["Friday social", "runs[0].event"],
      ["no loud music after 10", "constraints.notes"],
    ] as const;
    for (const [quote, path] of cases) {
      expect(findEvidenceField(quote, c)).toBe(path);
      const value = getCardField(c, path);
      expect(value).toBeTruthy();
      expect(normaliseText(value!).includes(normaliseText(quote))).toBe(true);
    }
  });

  it("getCardField reads the same paths flattenCardEntries emits", () => {
    for (const entry of flattenCardEntries(c)) {
      expect(getCardField(c, entry.path)).toBe(entry.value);
    }
  });

  it("returns the first matching field; spanning quotes may have no single field", () => {
    expect(findEvidenceField("venue space", c)).toBe("offers[0]");
    expect(findEvidenceField("a projector guest speakers", c)).toBeNull();
  });

  it("returns null for missing/short quotes and unknown paths", () => {
    expect(findEvidenceField(null, c)).toBeNull();
    expect(findEvidenceField("ab", c)).toBeNull();
    expect(getCardField(c, "offers[9]")).toBeNull();
    expect(getCardField(c, "constraints.maxGroupSize")).toBeNull();
  });
});

describe("checkEvidence", () => {
  const c = card();

  it("returns null for missing or blank quotes", () => {
    expect(checkEvidence(null, c)).toBeNull();
    expect(checkEvidence("  ", c)).toBeNull();
  });

  it("stores the trimmed quote and recomputed verified/field", () => {
    expect(checkEvidence("  a projector  ", c)).toEqual({
      quote: "a projector",
      verified: true,
      field: "offers[1]",
    });
    expect(checkEvidence("not on the card at all", c)).toEqual({
      quote: "not on the card at all",
      verified: false,
      field: null,
    });
  });
});

describe("highlightQuote", () => {
  it("highlights the original slice despite differing case, whitespace and quotes", () => {
    expect(highlightQuote("We host FOUNDERS nights here", "founders nights")).toEqual([
      { text: "We host ", highlight: false },
      { text: "FOUNDERS nights", highlight: true },
      { text: " here", highlight: false },
    ]);
    expect(highlightQuote("hello    world", "hello world")).toEqual([{ text: "hello    world", highlight: true }]);
    expect(highlightQuote("hello\u00a0world", "hello world")).toEqual([{ text: "hello\u00a0world", highlight: true }]);
    expect(highlightQuote("Founders’ nights at the hall", "Founders' nights")).toEqual([
      { text: "Founders’ nights", highlight: true },
      { text: " at the hall", highlight: false },
    ]);
  });

  it("maps multi-char normalisations like … back onto the original ellipsis", () => {
    expect(highlightQuote("We host founders…nights here", "founders...nights")).toEqual([
      { text: "We host ", highlight: false },
      { text: "founders…nights", highlight: true },
      { text: " here", highlight: false },
    ]);
    expect(highlightQuote("We host founders…nights here", "founders…nights")).toEqual([
      { text: "We host ", highlight: false },
      { text: "founders…nights", highlight: true },
      { text: " here", highlight: false },
    ]);
  });

  it("highlights through en/em dashes", () => {
    expect(highlightQuote("groups of 10–12 people", "10-12")).toEqual([
      { text: "groups of ", highlight: false },
      { text: "10–12", highlight: true },
      { text: " people", highlight: false },
    ]);
  });

  it("returns a single non-highlighted segment when the quote is absent or too short", () => {
    expect(highlightQuote("nothing here", "missing quote")).toEqual([{ text: "nothing here", highlight: false }]);
    expect(highlightQuote("hello world", "ab")).toEqual([{ text: "hello world", highlight: false }]);
    expect(highlightQuote("hello world", "...")).toEqual([{ text: "hello world", highlight: false }]);
  });

  it("strips wrapping punctuation from the quote without requiring it in the text", () => {
    expect(highlightQuote("hello world today", "“hello world.”")).toEqual([
      { text: "hello world", highlight: true },
      { text: " today", highlight: false },
    ]);
  });
});
