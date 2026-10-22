import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Tooltip } from "../../components/ui/Tooltip";
import { plural } from "../../lib/format";
import { SPEEDS } from "./player";
import type { ReplayPlayer } from "./useReplayPlayer";

/** Play/Pause, Skip, Restart, speed and progress. The caller places it (sticky bar or inline). */
export function ReplayControls({
  player,
  shown,
  total,
  onRestart,
  tooltipSide = "top",
}: {
  player: Pick<ReplayPlayer, "playing" | "finished" | "speed" | "toggle" | "skip" | "setSpeed">;
  shown: number;
  total: number;
  onRestart: () => void;
  tooltipSide?: "top" | "bottom";
}) {
  const { playing, finished, speed } = player;
  const percent = total ? Math.round((shown / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-primary min-w-[7.25rem]" onClick={player.toggle} aria-keyshortcuts="Space">
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {playing ? "Pause" : finished ? "Play again" : "Play"}
        </button>
        <Tooltip label="Show the next post now (→)" side={tooltipSide}>
          <button type="button" className="btn btn-icon" onClick={player.skip} disabled={finished} aria-label="Skip to the next post" aria-keyshortcuts="ArrowRight">
            <SkipForward size={16} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Restart from the first post" side={tooltipSide}>
          <button type="button" className="btn btn-icon" onClick={onRestart} aria-label="Restart">
            <RotateCcw size={16} aria-hidden />
          </button>
        </Tooltip>
        <div role="group" aria-label="Playback speed" className="ml-auto flex items-center gap-1 sm:ml-2">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className="chip-btn tabular" aria-pressed={speed === s} aria-label={`${s}x speed`} onClick={() => player.setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:order-first">
        <div
          role="progressbar"
          aria-label="Replay progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={shown}
          aria-valuetext={`${shown} of ${plural(total, "post")} shown`}
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular text-muted" aria-hidden>
          {shown} of {total}
        </span>
      </div>
    </div>
  );
}
