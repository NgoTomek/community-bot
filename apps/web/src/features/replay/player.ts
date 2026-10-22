/**
 * The replay clock. A recording is a list of steps; `schedule[i]` is when step i appears, in ms
 * on the recording's own clock (at 1x). Playing advances that clock by real elapsed time times
 * the speed. Every action carries `now` (real ms, e.g. performance.now()), so this stays pure.
 */

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** The first post appears this long after pressing play, whatever its own delay. */
export const FIRST_DELAY_MS = 600;

export interface PlayerState {
  /** When each step appears on the recording's clock (ms at 1x), ascending. */
  schedule: number[];
  /** Position on the recording's clock, taken at `anchor`. */
  position: number;
  /** Real time (ms) at which `position` was taken. */
  anchor: number;
  playing: boolean;
  speed: Speed;
}

export type PlayerAction =
  | { type: "play"; now: number }
  | { type: "pause"; now: number }
  | { type: "toggle"; now: number }
  | { type: "tick"; now: number }
  | { type: "skip"; now: number }
  | { type: "restart"; now: number }
  | { type: "speed"; speed: Speed; now: number };

/** Floating-point slack so a step due "now" is never missed by a rounding error. */
const EPSILON = 1e-6;

/** Cumulative appearance times from per-step delays. The first step waits FIRST_DELAY_MS. */
export function scheduleFromDelays(delays: number[], firstDelayMs = FIRST_DELAY_MS): number[] {
  let t = 0;
  return delays.map((delay, i) => {
    t += i === 0 ? firstDelayMs : Number.isFinite(delay) ? Math.max(0, delay) : 0;
    return t;
  });
}

export function createPlayer(schedule: number[], now: number, options: { autoplay?: boolean; speed?: Speed } = {}): PlayerState {
  return { schedule, position: 0, anchor: now, playing: (options.autoplay ?? true) && schedule.length > 0, speed: options.speed ?? 1 };
}

function endOf(schedule: number[]): number {
  return schedule.length ? schedule[schedule.length - 1] : 0;
}

/** Steps that have appeared by `position` on the recording's clock. */
export function countAt(schedule: number[], position: number): number {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (schedule[mid] <= position + EPSILON) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Position on the recording's clock at real time `now`. */
export function positionAt(state: PlayerState, now: number): number {
  if (!state.playing) return state.position;
  return Math.min(endOf(state.schedule), state.position + Math.max(0, now - state.anchor) * state.speed);
}

/** Steps visible as of the last action. Dispatch "tick" at msUntilNext to keep it current. */
export function revealedCount(state: PlayerState): number {
  return countAt(state.schedule, state.position);
}

export function isFinished(state: PlayerState): boolean {
  return revealedCount(state) >= state.schedule.length;
}

/** Real ms until the next step appears, or null when paused or finished. */
export function msUntilNext(state: PlayerState, now: number): number | null {
  if (!state.playing) return null;
  const position = positionAt(state, now);
  const next = countAt(state.schedule, position);
  if (next >= state.schedule.length) return 0;
  return Math.max(0, (state.schedule[next] - position) / state.speed);
}

/** Folds elapsed time into `position`; stops at the end. */
function settle(state: PlayerState, now: number): PlayerState {
  const position = positionAt(state, now);
  const done = countAt(state.schedule, position) >= state.schedule.length;
  return { ...state, position, anchor: now, playing: state.playing && !done };
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "tick":
      return settle(state, action.now);
    case "play":
      if (state.playing) return state;
      if (isFinished(state)) return { ...state, position: 0, anchor: action.now, playing: state.schedule.length > 0 };
      return { ...state, anchor: action.now, playing: true };
    case "pause":
      return { ...settle(state, action.now), playing: false };
    case "toggle":
      return playerReducer(state, { type: state.playing ? "pause" : "play", now: action.now });
    case "skip": {
      const settled = settle(state, action.now);
      const next = countAt(settled.schedule, settled.position);
      if (next >= settled.schedule.length) return settled;
      const last = next + 1 >= settled.schedule.length;
      return { ...settled, position: settled.schedule[next], anchor: action.now, playing: settled.playing && !last };
    }
    case "restart":
      return { ...state, position: 0, anchor: action.now, playing: state.schedule.length > 0 };
    case "speed":
      return { ...settle(state, action.now), speed: action.speed };
  }
}
