import type { Card } from "@community-bots/core";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { BotTag, DraftBadge } from "../../components/Badges";
import { EvidenceChip } from "../../components/EvidenceChip";
import { EmptyState } from "../../components/ui/States";
import type { Community } from "../../data/types";
import { buildWallPosts, filterWall, needFromPost, WALL_FILTERS, type WallFilter } from "../../lib/wall";
import { useNewRequest } from "../request/NewRequest";

const PAGE = 12;

/** Offers and needs from every card, posted by each community's Bot. */
export function Wall({ communities }: { communities: Community[] }) {
  const { open } = useNewRequest();
  const [filter, setFilter] = useState<WallFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const posts = useMemo(() => buildWallPosts(communities), [communities]);
  const visible = filterWall(posts, filter);
  const cards = useMemo(() => Object.fromEntries(communities.map((c) => [c.id, c.card])) as Record<string, Card>, [communities]);
  const names = useMemo(() => Object.fromEntries(communities.map((c) => [c.id, c.name])), [communities]);

  return (
    <section aria-labelledby="wall-title" className="mt-16" data-tour="wall">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="wall-title" className="font-display text-3xl">
            Offers and needs
          </h2>
          <p className="mt-1 text-muted">What each community's Bot says it can bring, and what it is looking for. Every line is quoted from a card.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter posts">
          {WALL_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip-btn"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setShown(PAGE);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card mt-6">
          <EmptyState compact title="Nothing in this category yet" body="Try another filter, or add your community so its Bot can post here." />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.slice(0, shown).map((post) => (
            <li key={post.id} className="card flex flex-col p-4">
              <div className="flex items-center gap-2">
                <Avatar id={post.communityId} name={post.communityName} size={28} />
                <Link to={`/c/${post.communityId}`} className="min-w-0 truncate text-sm font-medium hover:text-accent">
                  {post.communityName}
                </Link>
                <BotTag />
                <span className={`ml-auto pill ${post.kind === "offer" ? "border-ok/25 bg-ok-soft text-ok" : "border-accent/20 bg-accent-soft text-accent"}`}>
                  {post.kind === "offer" ? "Offers" : "Needs"}
                </span>
              </div>
              <p className="mt-3 flex-1 leading-snug">
                {post.text}
                {post.guess ? <span className="ml-1 text-xs text-warn">(guess)</span> : null}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <EvidenceChip quote={post.quote} preferredId={post.communityId} cards={cards} names={names} />
                {post.status === "draft" ? <DraftBadge /> : null}
              </div>
              <button
                type="button"
                className="btn btn-sm mt-4 self-start"
                onClick={() => open({ leadId: post.communityId, need: needFromPost(post) })}
              >
                Start a collab from this <ArrowRight size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {visible.length > shown ? (
        <div className="mt-6 text-center">
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({visible.length - shown})
          </button>
        </div>
      ) : null}
    </section>
  );
}
