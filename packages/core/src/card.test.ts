import { describe, expect, it } from "vitest";
import { isGuess, normaliseCard, normaliseDays, slugify } from "./card";
import { DAYS } from "./schemas";

describe("slugify", () => {
  it("strips accents and punctuation, lowercases, and hyphenates", () => {
    expect(slugify("Café del Río!")).toBe("cafe-del-rio");
    expect(slugify("Hello, World")).toBe("hello-world");
    expect(slugify("River Club")).toBe("river-club");
  });

  it("caps at 64 characters and trims a trailing hyphen left by the cut", () => {
    expect(slugify("n".repeat(80))).toBe("n".repeat(64));
    expect(slugify("n".repeat(63) + "-" + "xxxx")).toBe("n".repeat(63));
    expect(slugify("a".repeat(64))).toHaveLength(64);
  });

  it("falls back to 'community' when nothing remains", () => {
    expect(slugify("")).toBe("community");
    expect(slugify("!!!")).toBe("community");
    expect(slugify("---")).toBe("community");
  });
});

describe("normaliseDays", () => {
  it("accepts Monday, mon, and other aliases", () => {
    expect(normaliseDays("Monday")).toEqual(["Mon"]);
    expect(normaliseDays("mon")).toEqual(["Mon"]);
    expect(normaliseDays(["Tue", "tues", "tuesday"])).toEqual(["Tue"]);
    expect(normaliseDays("weds")).toEqual(["Wed"]);
    expect(normaliseDays("thurs")).toEqual(["Thu"]);
  });

  it("expands weekends and weekdays", () => {
    expect(normaliseDays("weekends")).toEqual(["Sat", "Sun"]);
    expect(normaliseDays("weekend")).toEqual(["Sat", "Sun"]);
    expect(normaliseDays("weekdays")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(normaliseDays("weekday")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("splits comma strings, ignores junk, and returns unique days in week order", () => {
    expect(normaliseDays("Sun, Monday, fri, potato, Wed")).toEqual(["Mon", "Wed", "Fri", "Sun"]);
    expect(normaliseDays("Sat and Sun")).toEqual(["Sat", "Sun"]);
    expect(normaliseDays("Mon/Wed;Fri")).toEqual(["Mon", "Wed", "Fri"]);
    expect(normaliseDays(["Sun", "Mon", 3, null, "nope"])).toEqual(["Mon", "Sun"]);
    expect(normaliseDays("weekends and Monday")).toEqual(["Mon", "Sat", "Sun"]);
    expect(normaliseDays("sometimes")).toEqual([]);
    expect(normaliseDays(undefined)).toEqual([]);
    expect(normaliseDays(DAYS)).toEqual([...DAYS]);
  });
});

describe("normaliseCard", () => {
  it("fills missing fields with null or []", () => {
    const c = normaliseCard({ name: "Harbour Lights" });
    expect(c.tagline).toBeNull();
    expect(c.location).toBeNull();
    expect(c.members).toBeNull();
    expect(c.tone).toBeNull();
    expect(c.runs).toEqual([]);
    expect(c.offers).toEqual([]);
    expect(c.needs).toEqual([]);
    expect(c.constraints).toEqual({ days: [], maxGroupSize: null, notes: null });
    expect(c.sourceUrls).toEqual([]);
  });

  it("turns unknown / N/A / none into null", () => {
    const c = normaliseCard({
      name: "Harbour Lights",
      tagline: "Unknown",
      location: "n/a",
      members: "NONE",
      tone: "null",
      constraints: { notes: "  N/A  " },
    });
    expect(c.tagline).toBeNull();
    expect(c.location).toBeNull();
    expect(c.members).toBeNull();
    expect(c.tone).toBeNull();
    expect(c.constraints.notes).toBeNull();
  });

  it("parses numeric-string maxGroupSize and rejects invalid values", () => {
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: "12" } }).constraints.maxGroupSize).toBe(12);
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: " 8 " } }).constraints.maxGroupSize).toBe(8);
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: 3 } }).constraints.maxGroupSize).toBe(3);
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: 0 } }).constraints.maxGroupSize).toBeNull();
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: 1.5 } }).constraints.maxGroupSize).toBeNull();
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: "lots" } }).constraints.maxGroupSize).toBeNull();
    expect(normaliseCard({ name: "A", constraints: { maxGroupSize: -4 } }).constraints.maxGroupSize).toBeNull();
  });

  it("accepts string runs and event/name objects", () => {
    const c = normaliseCard({
      name: "Harbour Lights",
      runs: ["Monthly picnic", { event: "Talks", frequency: "weekly" }, { name: "Mixer", frequency: "n/a" }, "unknown", ""],
    });
    expect(c.runs).toEqual([
      { event: "Monthly picnic", frequency: null },
      { event: "Talks", frequency: "weekly" },
      { event: "Mixer", frequency: null },
    ]);
  });

  it("derives id from opts.id or slugify(name), never from the model's id", () => {
    expect(normaliseCard({ id: "hacked", name: "Cedar Circle" }).id).toBe("cedar-circle");
    expect(normaliseCard({ id: "hacked", name: "Cedar Circle" }, { id: "custom-id" }).id).toBe("custom-id");
    expect(normaliseCard({}, { fallbackName: "North Bridge Guild" }).id).toBe("north-bridge-guild");
    expect(normaliseCard({}, { fallbackName: "North Bridge Guild" }).name).toBe("North Bridge Guild");
  });

  it("merges and dedupes sourceUrls, with card urls first", () => {
    const c = normaliseCard(
      { name: "Harbour Lights", sourceUrls: ["https://a.test", "https://b.test", "https://a.test"] },
      { sourceUrls: ["https://b.test", "https://c.test"] },
    );
    expect(c.sourceUrls).toEqual(["https://a.test", "https://b.test", "https://c.test"]);
  });
});

describe("isGuess", () => {
  it("is true only for strings that start with GUESS: ", () => {
    expect(isGuess("GUESS: they have a projector")).toBe(true);
    expect(isGuess("they have a projector")).toBe(false);
    expect(isGuess(null)).toBe(false);
    expect(isGuess(undefined)).toBe(false);
  });
});
