import { describe, expect, it } from "vitest";
import {
  FIRST_DELAY_MS,
  countAt,
  createPlayer,
  isFinished,
  msUntilNext,
  playerReducer,
  revealedCount,
  scheduleFromDelays,
  type PlayerAction,
  type PlayerState,
} from "./player";

// Three steps: the first after 600ms, then 2000ms, then 1000ms -> appear at 600, 2600, 3600.
const SCHEDULE = scheduleFromDelays([4000, 2000, 1000]);

function run(state: PlayerState, ...actions: PlayerAction[]): PlayerState {
  return actions.reduce(playerReducer, state);
}

describe("scheduleFromDelays", () => {
  it("starts with the first-post delay and accumulates the rest", () => {
    expect(SCHEDULE).toEqual([FIRST_DELAY_MS, 2600, 3600]);
    expect(scheduleFromDelays([])).toEqual([]);
  });

  it("treats negative or missing delays as no pause", () => {
    expect(scheduleFromDelays([100, -5, Number.NaN, 300])).toEqual([600, 600, 600, 900]);
  });

  it("counts steps at a position, including one that is due exactly now", () => {
    expect(countAt(SCHEDULE, 0)).toBe(0);
    expect(countAt(SCHEDULE, 599)).toBe(0);
    expect(countAt(SCHEDULE, 600)).toBe(1);
    expect(countAt(SCHEDULE, 3599.9999999)).toBe(3);
    expect(countAt(SCHEDULE, 99_999)).toBe(3);
  });
});

describe("playing", () => {
  it("autoplays and reveals each step on time", () => {
    const start = createPlayer(SCHEDULE, 1000);
    expect(start.playing).toBe(true);
    expect(revealedCount(start)).toBe(0);
    expect(msUntilNext(start, 1000)).toBe(600);
    expect(revealedCount(run(start, { type: "tick", now: 1599 }))).toBe(0);
    expect(revealedCount(run(start, { type: "tick", now: 1600 }))).toBe(1);
    expect(revealedCount(run(start, { type: "tick", now: 3600 }))).toBe(2);
  });

  it("does not autoplay when asked not to, or when there is nothing to play", () => {
    expect(createPlayer(SCHEDULE, 0, { autoplay: false }).playing).toBe(false);
    const empty = createPlayer([], 0);
    expect(empty.playing).toBe(false);
    expect(isFinished(empty)).toBe(true);
  });

  it("stops at the end and plays again from the start", () => {
    const done = run(createPlayer(SCHEDULE, 0), { type: "tick", now: 10_000 });
    expect(revealedCount(done)).toBe(3);
    expect(done.playing).toBe(false);
    expect(isFinished(done)).toBe(true);
    expect(msUntilNext(done, 20_000)).toBeNull();
    const again = run(done, { type: "play", now: 20_000 });
    expect(again.playing).toBe(true);
    expect(revealedCount(again)).toBe(0);
    expect(revealedCount(run(again, { type: "tick", now: 20_600 }))).toBe(1);
  });
});

describe("pause", () => {
  it("freezes the clock and resumes with the rest of the wait", () => {
    // 1000ms into the 2000ms wait for step 2, pause for a long time, then resume.
    const paused = run(createPlayer(SCHEDULE, 0), { type: "tick", now: 600 }, { type: "pause", now: 1600 });
    expect(paused.playing).toBe(false);
    expect(revealedCount(run(paused, { type: "tick", now: 60_000 }))).toBe(1);
    expect(msUntilNext(paused, 60_000)).toBeNull();
    const resumed = run(paused, { type: "play", now: 60_000 });
    expect(msUntilNext(resumed, 60_000)).toBe(1000);
    expect(revealedCount(run(resumed, { type: "tick", now: 60_999 }))).toBe(1);
    expect(revealedCount(run(resumed, { type: "tick", now: 61_000 }))).toBe(2);
  });

  it("toggles between playing and paused", () => {
    const start = createPlayer(SCHEDULE, 0);
    const paused = run(start, { type: "toggle", now: 100 });
    expect(paused.playing).toBe(false);
    expect(run(paused, { type: "toggle", now: 200 }).playing).toBe(true);
  });

  it("ignores play while already playing (no lost time)", () => {
    const start = createPlayer(SCHEDULE, 0);
    const same = run(start, { type: "play", now: 500 });
    expect(same).toBe(start);
    expect(revealedCount(run(same, { type: "tick", now: 600 }))).toBe(1);
  });
});

describe("skip", () => {
  it("shows the next step now and waits its full delay for the one after", () => {
    const start = createPlayer(SCHEDULE, 0);
    const skipped = run(start, { type: "skip", now: 100 });
    expect(revealedCount(skipped)).toBe(1);
    expect(skipped.playing).toBe(true);
    expect(msUntilNext(skipped, 100)).toBe(2000);
  });

  it("works while paused and stays paused", () => {
    const paused = run(createPlayer(SCHEDULE, 0), { type: "pause", now: 0 }, { type: "skip", now: 50 }, { type: "skip", now: 60 });
    expect(revealedCount(paused)).toBe(2);
    expect(paused.playing).toBe(false);
  });

  it("finishes on the last step and does nothing after it", () => {
    const end = run(createPlayer(SCHEDULE, 0), { type: "skip", now: 0 }, { type: "skip", now: 0 }, { type: "skip", now: 0 });
    expect(revealedCount(end)).toBe(3);
    expect(end.playing).toBe(false);
    expect(run(end, { type: "skip", now: 5 })).toEqual({ ...end, anchor: 5 });
  });
});

describe("speed", () => {
  it("divides every wait by the speed", () => {
    const fast = createPlayer(SCHEDULE, 0, { speed: 4 });
    expect(msUntilNext(fast, 0)).toBe(150);
    expect(revealedCount(run(fast, { type: "tick", now: 150 }))).toBe(1);
    expect(revealedCount(run(fast, { type: "tick", now: 650 }))).toBe(2);
  });

  it("keeps the progress made at the old speed when the speed changes mid-wait", () => {
    // Step 2 is due at 2600. At 1x until real 1600 (position 1600), then 2x: 1000 left -> 500ms.
    const changed = run(createPlayer(SCHEDULE, 0), { type: "speed", speed: 2, now: 1600 });
    expect(changed.speed).toBe(2);
    expect(changed.position).toBe(1600);
    expect(msUntilNext(changed, 1600)).toBe(500);
    expect(revealedCount(run(changed, { type: "tick", now: 2100 }))).toBe(2);
  });
});

describe("restart", () => {
  it("goes back to the first step and plays", () => {
    const paused = run(createPlayer(SCHEDULE, 0), { type: "tick", now: 3000 }, { type: "pause", now: 3000 });
    expect(revealedCount(paused)).toBe(2);
    const restarted = run(paused, { type: "restart", now: 5000 });
    expect(revealedCount(restarted)).toBe(0);
    expect(restarted.playing).toBe(true);
    expect(msUntilNext(restarted, 5000)).toBe(600);
  });
});
