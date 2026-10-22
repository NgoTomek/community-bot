import { useCallback, useEffect, useReducer } from "react";
import { createPlayer, isFinished, msUntilNext, playerReducer, revealedCount, type Speed } from "./player";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Drives the replay clock in real time: one timer per step, re-armed after every action.
 * The schedule is read once; remount (key) to load a different recording.
 */
export function useReplayPlayer(schedule: number[], autoplay = true) {
  const [state, dispatch] = useReducer(playerReducer, schedule, (s) => createPlayer(s, now(), { autoplay }));

  useEffect(() => {
    const wait = msUntilNext(state, now());
    if (wait === null) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick", now: now() }), Math.ceil(wait));
    return () => window.clearTimeout(timer);
  }, [state]);

  const play = useCallback(() => dispatch({ type: "play", now: now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", now: now() }), []);
  const toggle = useCallback(() => dispatch({ type: "toggle", now: now() }), []);
  const skip = useCallback(() => dispatch({ type: "skip", now: now() }), []);
  const restart = useCallback(() => dispatch({ type: "restart", now: now() }), []);
  const setSpeed = useCallback((speed: Speed) => dispatch({ type: "speed", speed, now: now() }), []);

  return {
    revealed: revealedCount(state),
    playing: state.playing,
    finished: isFinished(state),
    speed: state.speed,
    play,
    pause,
    toggle,
    skip,
    restart,
    setSpeed,
  };
}

export type ReplayPlayer = ReturnType<typeof useReplayPlayer>;

function closest(target: EventTarget | null, selector: string): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(selector);
}

const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
/** Space activates these natively, so the shortcut leaves them alone. */
const ACTIVATABLE = "button, a[href], summary, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='radio'], [role='tab'], [role='menuitem'], [role='option']";
/** Arrow keys already mean something here. */
const ARROW_WIDGETS = "[role='slider'], [role='radiogroup'], [role='tablist'], [role='menu'], [role='listbox']";

/** Space plays or pauses, ArrowRight skips. Never while typing or while a dialog is open. */
export function useReplayKeys(player: Pick<ReplayPlayer, "toggle" | "skip">, enabled = true) {
  const { toggle, skip } = player;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (closest(event.target, EDITABLE) || document.querySelector("dialog[open]")) return;
      if (event.key === " ") {
        if (closest(event.target, ACTIVATABLE)) return;
        event.preventDefault();
        if (!event.repeat) toggle();
      } else if (event.key === "ArrowRight") {
        if (closest(event.target, ARROW_WIDGETS)) return;
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip, enabled]);
}
