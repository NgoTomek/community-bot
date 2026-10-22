import { describe, expect, it } from "vitest";
import { isUnseenPost } from "./renegotiate";

const dealWentOut = "2026-10-22T18:00:00.000+00:00";
const note = "The organiser of South Club asked for changes: Make it a Thursday";
const workerNotes = new Set([note]);

const row = (role: "human" | "bot", text: string, created_at: string) => ({ role, text, created_at });

describe("isUnseenPost", () => {
  it("feeds an organiser post made while responses were pending into the next round", () => {
    expect(isUnseenPost(row("human", "Keep it under 40 people", "2026-10-22T18:05:00+00:00"), dealWentOut, workerNotes)).toBe(true);
  });

  it("treats posts from before the deal went out as already seen", () => {
    expect(isUnseenPost(row("human", "Keep it under 40 people", "2026-10-22T17:55:00+00:00"), dealWentOut, workerNotes)).toBe(false);
    expect(isUnseenPost(row("human", "Same instant", dealWentOut), dealWentOut, workerNotes)).toBe(false);
  });

  it("never counts the worker's own renegotiation notes or Bot messages", () => {
    expect(isUnseenPost(row("human", note, "2026-10-22T18:05:00+00:00"), dealWentOut, workerNotes)).toBe(false);
    expect(isUnseenPost(row("bot", "We accept.", "2026-10-22T18:05:00+00:00"), dealWentOut, workerNotes)).toBe(false);
  });

  it("feeds nothing when there is no current deal to compare with", () => {
    expect(isUnseenPost(row("human", "Keep it under 40 people", "2026-10-22T18:05:00+00:00"), null, workerNotes)).toBe(false);
  });
});
