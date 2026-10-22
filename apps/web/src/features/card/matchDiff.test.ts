import type { Fit, MatchCandidate } from "@community-bots/core";
import { describe, expect, it } from "vitest";
import { diffMatches, summarizeMatchDiff } from "./matchDiff";
import { EMPTY_HISTORY, loadMatchHistory, MATCH_HISTORY_PREFIX, pushMatchSnapshot, saveMatchHistory, type MatchSnapshot } from "./matchHistory";

const c = (communityId: string, fit: Fit = "good"): MatchCandidate => ({
  communityId,
  fit,
  reasons: [{ claim: "Offers a space", evidence: "A room", cardOwnerId: communityId }],
  concerns: [],
});

describe("match diff", () => {
  it("has no changes to report without a previous run", () => {
    const diff = diffMatches(null, [c("a"), c("b")]);
    expect(diff.hasPrevious).toBe(false);
    expect(diff.current.map((r) => [r.rank, r.change])).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(diff.previous).toEqual([]);
    expect(diff.count).toBe(0);
    expect(summarizeMatchDiff(diff)).toBe("");
  });

  it("reports the same ranking", () => {
    const diff = diffMatches([c("a"), c("b")], [c("a"), c("b")]);
    expect(diff.count).toBe(0);
    expect(diff.current.every((r) => r.change?.kind === "same")).toBe(true);
    expect(summarizeMatchDiff(diff)).toBe("Same ranking as the previous run");
  });

  it("finds new, dropped and moved communities with the number of places", () => {
    const diff = diffMatches([c("a"), c("b"), c("c"), c("d")], [c("c"), c("a"), c("e"), c("b")]);
    const byId = Object.fromEntries(diff.current.map((r) => [r.candidate.communityId, r]));
    expect(byId.c.change).toEqual({ kind: "up", places: 2 });
    expect(byId.c.previousRank).toBe(3);
    expect(byId.a.change).toEqual({ kind: "down", places: 1 });
    expect(byId.e.change).toEqual({ kind: "new" });
    expect(byId.e.previousRank).toBeNull();
    expect(byId.b.change).toEqual({ kind: "down", places: 2 });
    expect(diff.added).toEqual(["e"]);
    expect(diff.dropped).toEqual(["d"]);
    expect(diff.moved).toEqual(["c", "a", "b"]);
    expect(diff.previous.find((r) => r.candidate.communityId === "d")).toMatchObject({ rank: 4, currentRank: null, dropped: true });
    expect(diff.previous.find((r) => r.candidate.communityId === "c")).toMatchObject({ rank: 3, currentRank: 1, dropped: false });
    expect(diff.count).toBe(5);
    expect(summarizeMatchDiff(diff)).toBe("1 new, 1 dropped and 3 moved");
  });

  it("notes a changed fit, even when the position is the same", () => {
    const diff = diffMatches([c("a", "good"), c("b", "weak")], [c("a", "strong"), c("b", "weak")]);
    expect(diff.current[0]).toMatchObject({ change: { kind: "same" }, fitBefore: "good" });
    expect(diff.current[1].fitBefore).toBeNull();
    expect(diff.fitChanged).toEqual(["a"]);
    expect(summarizeMatchDiff(diff)).toBe("1 fit changed");
  });

  it("handles an empty run on either side", () => {
    const gone = diffMatches([c("a")], []);
    expect(gone.dropped).toEqual(["a"]);
    expect(summarizeMatchDiff(gone)).toBe("1 dropped");
    const fresh = diffMatches([], [c("a"), c("b")]);
    expect(fresh.added).toEqual(["a", "b"]);
    expect(summarizeMatchDiff(fresh)).toBe("2 new");
  });

  it("ignores repeated communities in a run", () => {
    const diff = diffMatches([c("a"), c("a"), c("b")], [c("b"), c("b"), c("a")]);
    expect(diff.current.map((r) => r.candidate.communityId)).toEqual(["b", "a"]);
    expect(diff.previous.map((r) => r.candidate.communityId)).toEqual(["a", "b"]);
    expect(diff.moved).toEqual(["b", "a"]);
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const snap = (jobId: string, ids: string[]): MatchSnapshot => ({
  jobId,
  need: "A venue for 40 people",
  at: "2026-10-22T10:00:00.000Z",
  backend: "mock",
  candidates: ids.map((id) => c(id)),
});

describe("match history", () => {
  it("keeps the latest and the previous run, and ignores the same job twice", () => {
    let history = pushMatchSnapshot(EMPTY_HISTORY, snap("j1", ["a"]));
    expect(history.previous).toBeNull();
    history = pushMatchSnapshot(history, snap("j2", ["b"]));
    expect(history.latest?.jobId).toBe("j2");
    expect(history.previous?.jobId).toBe("j1");
    expect(pushMatchSnapshot(history, snap("j2", ["b"]))).toBe(history);
    history = pushMatchSnapshot(history, snap("j3", ["c"]));
    expect([history.latest?.jobId, history.previous?.jobId]).toEqual(["j3", "j2"]);
  });

  it("saves per community and reads it back", () => {
    const storage = memoryStorage();
    const history = pushMatchSnapshot(pushMatchSnapshot(EMPTY_HISTORY, snap("j1", ["a"])), snap("j2", ["b", "a"]));
    saveMatchHistory(storage, "alpha", history);
    expect(loadMatchHistory(storage, "alpha")).toEqual(history);
    expect(loadMatchHistory(storage, "beta")).toEqual(EMPTY_HISTORY);
    saveMatchHistory(storage, "alpha", EMPTY_HISTORY);
    expect(storage.data.has(`${MATCH_HISTORY_PREFIX}alpha`)).toBe(false);
  });

  it("ignores broken storage and drops unreadable candidates", () => {
    const storage = memoryStorage();
    storage.setItem(`${MATCH_HISTORY_PREFIX}alpha`, "{not json");
    expect(loadMatchHistory(storage, "alpha")).toEqual(EMPTY_HISTORY);
    storage.setItem(
      `${MATCH_HISTORY_PREFIX}alpha`,
      JSON.stringify({ latest: { ...snap("j1", ["a"]), candidates: [c("a"), { communityId: "b", fit: "amazing" }] }, previous: { jobId: 3 } }),
    );
    const loaded = loadMatchHistory(storage, "alpha");
    expect(loaded.latest?.candidates.map((x) => x.communityId)).toEqual(["a"]);
    expect(loaded.previous).toBeNull();
    expect(loadMatchHistory(null, "alpha")).toEqual(EMPTY_HISTORY);
  });
});
