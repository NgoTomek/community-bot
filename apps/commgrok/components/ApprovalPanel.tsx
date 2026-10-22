import { Ban, RotateCcw } from "lucide-react";
import { Avatar, TeamStatePill, cx } from "./ui";
import { PulseDot } from "./ReviewActions";
import { relativeTime } from "@/lib/time";
import type { ApprovalSummary, DecisionNote, TeamApprovalState } from "@/lib/types";

const VERB: Record<TeamApprovalState, string> = {
  waiting: "",
  approved: "Accepted",
  rejected: "Rejected",
  renegotiate: "Sent back",
  stale: "Accepted an earlier version",
};

/**
 * The latest organiser note. Prefers the server's `latestNote`; falls back to the newest
 * reject/renegotiate row in the approval summary (older data or a loader without latestNote).
 */
export function resolveNote(latestNote: DecisionNote | null | undefined, approval: ApprovalSummary): DecisionNote | null {
  if (latestNote) return latestNote;
  const row = approval.rows
    .filter((r) => (r.state === "rejected" || r.state === "renegotiate") && r.at)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  if (!row) return null;
  return {
    decision: row.state === "rejected" ? "rejected" : "renegotiate",
    note: row.note ?? "",
    by: row.approver_name ?? row.team.name,
    team: row.team.name,
    at: row.at!,
    revision: 0,
  };
}

export function ApprovalPanel({ approval, myTeamId }: { approval: ApprovalSummary; myTeamId?: string }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {approval.rows.map((r) => (
        <div key={r.team.id} className="flex items-start gap-3 p-3.5">
          <Avatar name={r.team.name} url={r.team.avatar_url} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="min-w-0 font-semibold">
                {r.team.name}
                {r.team.id === myTeamId && <span className="ml-1.5 text-xs font-medium text-muted">(you)</span>}
              </div>
              <TeamStatePill state={r.state} />
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {r.approver_name && r.at ? (
                <>
                  {VERB[r.state]} by <span className="font-medium text-fg">{r.approver_name}</span> · <time dateTime={r.at}>{relativeTime(r.at)}</time>
                </>
              ) : (
                r.team.role ?? "Waiting for a decision"
              )}
            </div>
            {r.note && (r.state === "rejected" || r.state === "renegotiate") && (
              <p className={cx("mt-2 rounded-xl px-3 py-2 text-sm", r.state === "rejected" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>“{r.note}”</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Big status card at the top of the review page: renegotiating, rejected, or stale (needs re-approval). */
export function DecisionStatusCard({
  status,
  note,
  stale,
  revision,
}: {
  status: string;
  note: DecisionNote | null;
  stale: boolean;
  revision: number;
}) {
  const who = note ? `${note.by}${note.team && note.team !== note.by ? ` (${note.team})` : ""}` : null;

  if (status === "renegotiating") {
    return (
      <div role="status" className="mb-5 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-warn">
        <div className="flex items-center gap-2.5 text-[15px] font-bold">
          <PulseDot /> Waiting for bots…
        </div>
        <p className="mt-1 text-sm opacity-90">
          Sent back{who ? <> by <strong className="font-semibold">{who}</strong></> : null}
          {note?.at ? <> · <time dateTime={note.at}>{relativeTime(note.at)}</time></> : null}. A revised version will appear here.
        </p>
        {note?.note && <p className="mt-3 rounded-xl bg-card/70 px-3 py-2.5 text-[15px] leading-snug text-fg">“{note.note}”</p>}
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="mb-5 rounded-2xl border border-bad/30 bg-bad-soft p-4 text-bad">
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <Ban aria-hidden className="size-4.5" /> Rejected
        </div>
        <p className="mt-1 text-sm opacity-90">
          {who ? <>By <strong className="font-semibold">{who}</strong></> : "Final decision"}
          {note?.at ? <> · <time dateTime={note.at}>{relativeTime(note.at)}</time></> : null}. It won&apos;t be published.
        </p>
        <p className="mt-3 rounded-xl bg-card/70 px-3 py-2.5 text-[15px] leading-snug text-fg">
          {note?.note ? `“${note.note}”` : <span className="text-muted">No reason given.</span>}
        </p>
      </div>
    );
  }

  if (stale && status === "proposed") {
    return (
      <div key={`stale-${revision}`} className="flash mb-5 flex gap-2.5 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold">Revised — needs your re-approval.</strong> This proposal changed (now v{revision}) after your team accepted it.
          See what changed under Activity, then re-accept.
        </span>
      </div>
    );
  }
  return null;
}
