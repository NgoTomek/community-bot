import { describe, expect, it } from "vitest";
import { addDays, allowedDaysForAll, dayOfWeek, isValidIsoDate, nextAllowedDate, todayIso } from "./dates";
import { DAYS, type Day } from "./schemas";

describe("todayIso", () => {
  it("uses local date parts of the injected now", () => {
    expect(todayIso(new Date(2026, 2, 15, 0, 0, 0))).toBe("2026-03-15");
    expect(todayIso(new Date(2026, 2, 15, 23, 59, 59))).toBe("2026-03-15");
    expect(todayIso(new Date(2026, 0, 5, 8, 0, 0))).toBe("2026-01-05");
  });
});

describe("dayOfWeek", () => {
  it("is timezone-independent for YYYY-MM-DD", () => {
    expect(dayOfWeek("2026-03-15")).toBe("Sun");
    expect(dayOfWeek("2026-03-16")).toBe("Mon");
    expect(dayOfWeek("2026-03-20")).toBe("Fri");
    expect(dayOfWeek("2026-03-21")).toBe("Sat");
    expect(dayOfWeek("2024-02-29")).toBe("Thu");
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });
});

describe("isValidIsoDate", () => {
  it("accepts real calendar dates and rejects Feb 30", () => {
    expect(isValidIsoDate("2026-03-15")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-3-15")).toBe(false);
  });
});

describe("allowedDaysForAll", () => {
  it("treats an empty list as no restriction and returns week order", () => {
    expect(allowedDaysForAll([[], []])).toEqual([...DAYS]);
    expect(allowedDaysForAll([["Mon", "Wed"], []])).toEqual(["Mon", "Wed"]);
    expect(allowedDaysForAll([["Mon", "Wed", "Fri"], ["Wed", "Fri", "Sun"]])).toEqual(["Wed", "Fri"]);
    expect(allowedDaysForAll([["Mon"], ["Tue"]])).toEqual([]);
    expect(allowedDaysForAll([])).toEqual([...DAYS]);
  });
});

describe("nextAllowedDate", () => {
  it("returns the first date on or after fromIso whose weekday is allowed", () => {
    expect(nextAllowedDate("2026-03-16", ["Wed", "Fri"])).toBe("2026-03-18");
    expect(nextAllowedDate("2026-03-18", ["Wed"])).toBe("2026-03-18");
    expect(nextAllowedDate("2026-03-20", ["Mon"])).toBe("2026-03-23");
    expect(nextAllowedDate("2026-03-16", [])).toBeNull();
    expect(nextAllowedDate("2026-03-16", ["Mon"] as Day[])).toBe("2026-03-16");
  });
});
