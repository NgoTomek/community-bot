import { LayoutGroup } from "framer-motion";
import { ArrowRight, Link2, MessagesSquare, Sparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIdentity } from "../app/identity";
import { useNeedsYou } from "../app/needsYou";
import { usePageTitle } from "../app/title";
import { useTour } from "../app/tour";
import { ErrorState, Skeleton, SkeletonCard } from "../components/ui/States";
import { useData } from "../data/DataProvider";
import { useCommunities, useLastPosts, useRuns } from "../data/hooks";
import { NeedsYouStrip } from "../features/board/NeedsYouStrip";
import { RunCard } from "../features/board/RunCard";
import { Wall } from "../features/board/Wall";
import { groupByLane, LANES, needsYouRunIds } from "../lib/lanes";

export default function Board() {
  usePageTitle("Board");
  const source = useData();
  const { active } = useIdentity();
  const { pending, error: needsError } = useNeedsYou();
  const communities = useCommunities();
  const runs = useRuns();
  const runIds = useMemo(() => (runs.data ?? []).map((r) => r.id), [runs.data]);
  const lastPosts = useLastPosts(runIds);

  const names = useMemo(() => Object.fromEntries((communities.data ?? []).map((c) => [c.id, c.name])), [communities.data]);
  const lanes = useMemo(() => groupByLane(runs.data ?? []), [runs.data]);
  const needsYou = useMemo(() => needsYouRunIds(pending), [pending]);

  const empty = communities.data !== undefined && communities.data.length === 0;

  if (empty && !runs.data?.length) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <PasteHero big />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <section className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-10 sm:pt-12" data-tour="board-head">
        <div>
          <p className="eyebrow">You are {active?.name ?? "an organiser"}</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">Board</h1>
        </div>
        <Link to="/add" className="btn">
          <Link2 size={16} aria-hidden /> Add a community
        </Link>
      </section>

      {needsError && !pending.length ? <p className="mb-6 text-sm text-muted">Could not load your requests: {needsError}</p> : null}
      <NeedsYouStrip requests={pending} />

      <section aria-labelledby="lanes-title" data-tour="collabs">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="lanes-title" className="font-display text-3xl">
            Collabs
          </h2>
          {runs.data ? <span className="text-sm text-muted">{runs.data.length} in total</span> : null}
        </div>
        {runs.loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {LANES.map((lane) => (
              <div key={lane.id} className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <SkeletonCard />
              </div>
            ))}
          </div>
        ) : runs.error && !runs.data ? (
          <ErrorState message={runs.error} onRetry={runs.reload} />
        ) : (
          <LayoutGroup>
            <div className="grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
              {LANES.map((lane) => {
                const items = lanes[lane.id];
                return (
                  <section key={lane.id} aria-labelledby={`lane-${lane.id}`} className="min-w-0">
                    <h3 id={`lane-${lane.id}`} className="mb-3 flex items-center gap-2 border-b border-line pb-2">
                      <span className="text-sm font-semibold">{lane.label}</span>
                      <span className="tabular text-sm text-faint">{items.length}</span>
                    </h3>
                    {items.length ? (
                      <ul className="space-y-3">
                        {items.map((run) => (
                          <RunCard key={run.id} run={run} names={names} lastPost={lastPosts.data?.[run.id]} needsYou={needsYou.has(run.id)} showSample={source.kind !== "mock"} />
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-faint">{lane.empty}</p>
                    )}
                  </section>
                );
              })}
            </div>
          </LayoutGroup>
        )}
      </section>

      {communities.data?.length ? <Wall communities={communities.data} /> : communities.loading ? null : communities.error ? <div className="mt-16"><ErrorState message={communities.error} onRetry={communities.reload} /></div> : null}
    </div>
  );
}

/** The fastest way in: paste a public link to your community. */
function PasteHero({ big = false }: { big?: boolean }) {
  const navigate = useNavigate();
  const tour = useTour();
  const [url, setUrl] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    navigate(`/add?url=${encodeURIComponent(/^https?:\/\//i.test(value) ? value : `https://${value}`)}`);
  };
  return (
    <section className={big ? "py-20 sm:py-28" : "pb-12 pt-10 sm:pb-16 sm:pt-16"} data-tour="hero">
      <p className="eyebrow">Open source · Humans decide</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] sm:text-[56px]">Your community's Bot finds partners and drafts the event. You approve it.</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Paste a public link to your community. Its Bot drafts a card, finds communities that fit, and negotiates with their Bots in the open. Nothing is agreed until every organiser says yes.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link to="/walkthrough" className="btn btn-primary btn-lg">
          <MessagesSquare size={16} aria-hidden /> Watch the Bots negotiate
        </Link>
        {tour.available ? (
          <button type="button" className="btn btn-lg" onClick={() => tour.start()}>
            <Sparkles size={16} className="text-accent" aria-hidden /> Take the guided tour
          </button>
        ) : null}
      </div>
      <form onSubmit={submit} className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row">
        <label htmlFor="paste-link" className="sr-only">
          Paste your community link
        </label>
        <input
          id="paste-link"
          type="url"
          inputMode="url"
          autoComplete="url"
          className="input h-12 flex-1 text-base"
          placeholder="Paste your community link, e.g. https://www.meetup.com/your-group"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-lg" disabled={!url.trim()}>
          Draft my card <ArrowRight size={16} aria-hidden />
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have an organiser link? Paste it in the menu at the top right. Or{" "}
        <Link to="/demo" className="font-medium text-accent hover:underline">
          watch a recorded negotiation
        </Link>
        .
      </p>
    </section>
  );
}
