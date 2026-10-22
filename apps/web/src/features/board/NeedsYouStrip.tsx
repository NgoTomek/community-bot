import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePresenter } from "../../app/presenter";
import { Avatar } from "../../components/Avatar";
import type { RequestSummary } from "../../data/types";
import { shortDate } from "../../lib/format";
import { DecisionForm } from "../decision/DecisionForm";

/** Requests waiting on the user (or on anyone, in presenter mode), each decidable in place. */
export function NeedsYouStrip({ requests }: { requests: RequestSummary[] }) {
  const { isPresenter } = usePresenter();
  if (!requests.length) return null;
  return (
    <section aria-labelledby="needs-you-title" className="mb-12">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 id="needs-you-title" className="font-display text-2xl">
          Needs you
        </h2>
        <span className="pill bg-accent-bg text-accent-fg">{requests.length}</span>
        {isPresenter ? <span className="text-sm text-muted">Presenter mode: every pending decision</span> : null}
      </div>
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-thin sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
        {requests.map((r) => (
          <li key={`${r.token}:${r.round}`} className="card w-[86vw] max-w-sm shrink-0 snap-start border-accent/40 p-4 sm:w-auto sm:max-w-none">
            <div className="flex items-start gap-3">
              {r.communityId ? <Avatar id={r.communityId} name={r.communityName ?? r.communityId} size={28} /> : null}
              <div className="min-w-0 flex-1">
                <p className="eyebrow">
                  Round {r.round}
                  {r.communityName ? ` · for ${r.communityName}` : ""}
                </p>
                <p className="mt-1 font-medium leading-snug">{r.title || "Untitled collab"}</p>
                {r.date ? <p className="text-sm text-muted">{shortDate(r.date)}</p> : null}
              </div>
              {r.runId ? (
                <Link to={`/run/${r.runId}`} className="btn btn-ghost btn-sm shrink-0" aria-label={`Open ${r.title}`}>
                  Open <ArrowUpRight size={14} aria-hidden />
                </Link>
              ) : null}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <DecisionForm token={r.token} round={r.round} label={isPresenter && r.communityName ? `Acting for ${r.communityName}` : "Your decision"} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
