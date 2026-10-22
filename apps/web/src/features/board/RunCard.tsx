import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Avatar, AvatarStack } from "../../components/Avatar";
import { RunStatusPill, SampleBadge } from "../../components/Badges";
import type { Message, Run } from "../../data/types";
import { relativeTime, truncate } from "../../lib/format";

/** One collab on the board: the need, who is in it, the round, the last Bot post. */
export function RunCard({
  run,
  names,
  lastPost,
  needsYou,
  showSample,
}: {
  run: Run;
  names: Record<string, string>;
  lastPost: Message | undefined;
  needsYou: boolean;
  showSample: boolean;
}) {
  const ids = [run.leadId, ...run.partnerIds];
  const people = ids.map((id) => ({ id, name: names[id] ?? id }));
  return (
    <motion.li layout layoutId={`run-${run.id}`} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
      <Link
        to={`/run/${run.id}`}
        className={`card group block p-4 transition-colors hover:border-line-strong ${needsYou ? "border-accent/50 ring-1 ring-accent/20" : ""}`}
        aria-label={`${run.need}. ${needsYou ? "Needs your decision." : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <AvatarStack items={people} size={22} />
          <span className="flex items-center gap-1.5">
            {needsYou ? <span className="pill bg-accent-bg text-accent-fg">Needs you</span> : null}
            {run.round > 1 ? <span className="pill border-line text-muted">R{run.round}</span> : null}
          </span>
        </div>
        <p className="mt-3 line-clamp-3 font-medium leading-snug group-hover:text-accent">{run.need}</p>
        <p className="mt-1 text-xs text-muted">
          Led by {names[run.leadId] ?? run.leadId} · {relativeTime(run.createdAt)}
        </p>
        {run.typing ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Avatar id={run.typing} name={names[run.typing] ?? run.typing} size={18} />
            {names[run.typing] ?? run.typing} Bot is writing
            <span className="typing-dots text-faint" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </p>
        ) : lastPost ? (
          <p className="mt-3 flex gap-2 rounded-lg bg-surface-2 p-2 text-sm text-muted">
            <span className="mt-0.5 shrink-0">
              <Avatar id={lastPost.communityId} name={names[lastPost.communityId] ?? lastPost.speaker} size={18} />
            </span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{names[lastPost.communityId] ?? lastPost.speaker} Bot: </span>
              {truncate(lastPost.text, 110)}
            </span>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RunStatusPill run={run} />
          {showSample && run.backend === "mock" ? <SampleBadge compact /> : null}
        </div>
      </Link>
    </motion.li>
  );
}
