import type { RequestSummary, Run } from "../data/types";

export type Lane = "negotiating" | "waiting" | "confirmed" | "ended";

export const LANES: { id: Lane; label: string; empty: string }[] = [
  { id: "negotiating", label: "Negotiating", empty: "No Bots are talking right now." },
  { id: "waiting", label: "Waiting on others", empty: "No deals are out for approval." },
  { id: "confirmed", label: "Confirmed", empty: "Nothing confirmed yet." },
  { id: "ended", label: "Ended", empty: "Nothing has ended." },
];

/** Which board lane a run belongs to. Stopped runs end, whatever their last status was. */
export function classifyRun(run: Pick<Run, "status" | "control">): Lane {
  if (run.control === "stopped") return "ended";
  switch (run.status) {
    case "matching":
    case "negotiating":
    case "compiling":
      return "negotiating";
    case "pending_approval":
      return "waiting";
    case "confirmed":
      return "confirmed";
    default:
      return "ended";
  }
}

/** Runs grouped by lane, newest first inside each lane. */
export function groupByLane<T extends Pick<Run, "status" | "control" | "createdAt">>(runs: T[]): Record<Lane, T[]> {
  const lanes: Record<Lane, T[]> = { negotiating: [], waiting: [], confirmed: [], ended: [] };
  for (const run of runs) lanes[classifyRun(run)].push(run);
  for (const lane of Object.values(lanes)) lane.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return lanes;
}

/** Run ids that have a pending request for the viewer. */
export function needsYouRunIds(requests: RequestSummary[]): Set<string> {
  const ids = new Set<string>();
  for (const request of requests) {
    if (request.status === "pending" && request.runId) ids.add(request.runId);
  }
  return ids;
}
