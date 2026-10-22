import { describe, expect, it } from "vitest";
import { announcementCopy, eventPhase, icsFileName, readRsvp, rsvpKey, rsvpNameError, saveRsvp } from "./logic";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("eventPhase", () => {
  const run = (overrides: Partial<{ dealId: string | null; status: "pending_approval" | "confirmed" | "declined" | "negotiating"; round: number }>) => ({
    dealId: "d2",
    status: "pending_approval" as const,
    round: 2,
    ...overrides,
  });

  it("follows allApproved while the run is unknown", () => {
    expect(eventPhase({ dealId: "d2", allApproved: false, round: null, run: undefined })).toBe("draft");
    expect(eventPhase({ dealId: "d2", allApproved: true, round: null, run: undefined })).toBe("confirmed");
  });

  it("is confirmed only for the run's current deal", () => {
    expect(eventPhase({ dealId: "d2", allApproved: true, round: 2, run: run({ status: "confirmed" }) })).toBe("confirmed");
    expect(eventPhase({ dealId: "d1", allApproved: true, round: 1, run: run({ status: "confirmed" }) })).toBe("replaced");
  });

  it("says when the collab was declined", () => {
    expect(eventPhase({ dealId: "d2", allApproved: false, round: 2, run: run({ status: "declined" }) })).toBe("declined");
  });

  it("notices a new round being negotiated before its deal exists", () => {
    expect(eventPhase({ dealId: "d2", allApproved: false, round: 2, run: run({ status: "negotiating", round: 3 }) })).toBe("renegotiating");
    expect(eventPhase({ dealId: "d2", allApproved: false, round: 2, run: run({}) })).toBe("draft");
  });
});

describe("rsvpNameError", () => {
  it("accepts 1 to 60 characters after trimming", () => {
    expect(rsvpNameError("  ")).not.toBeNull();
    expect(rsvpNameError("A")).toBeNull();
    expect(rsvpNameError(` ${"x".repeat(60)} `)).toBeNull();
    expect(rsvpNameError("x".repeat(61))).not.toBeNull();
  });
});

describe("saved RSVPs", () => {
  it("round-trips per deal", () => {
    const storage = memoryStorage();
    expect(readRsvp(storage, "d1")).toBeNull();
    saveRsvp(storage, "d1", { name: "Sam", at: "2026-10-22T10:00:00Z" });
    expect(readRsvp(storage, "d1")).toEqual({ name: "Sam", at: "2026-10-22T10:00:00Z" });
    expect(readRsvp(storage, "d2")).toBeNull();
    expect(rsvpKey("d1")).toBe("cb.rsvp.d1");
  });

  it("ignores broken or empty entries and missing storage", () => {
    const storage = memoryStorage();
    storage.setItem(rsvpKey("a"), "{not json");
    storage.setItem(rsvpKey("b"), JSON.stringify({ name: "  " }));
    expect(readRsvp(storage, "a")).toBeNull();
    expect(readRsvp(storage, "b")).toBeNull();
    expect(readRsvp(null, "a")).toBeNull();
    expect(() => saveRsvp(null, "a", { name: "Sam", at: "" })).not.toThrow();
  });
});

describe("icsFileName", () => {
  it("makes a short, safe file name from the title", () => {
    expect(icsFileName("Climate Game Jam: Build a game in one evening!")).toBe("climate-game-jam-build-a-game-in-one-evening.ics");
    expect(icsFileName("Café & Código")).toBe("cafe-codigo.ics");
    expect(icsFileName("!!!")).toBe("event.ics");
    expect(icsFileName("a".repeat(100)).length).toBe(64);
  });
});

describe("announcementCopy", () => {
  it("adds the event link on its own line", () => {
    expect(announcementCopy(" Join us! ", "https://x.test/event/1")).toBe("Join us!\nhttps://x.test/event/1");
  });
});
