import { ArrowLeft, ArrowRight, CalendarX2 } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useProjector } from "../../app/projector";
import { usePageTitle } from "../../app/title";
import { Avatar } from "../../components/Avatar";
import { DraftBadge } from "../../components/Badges";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "../../components/ui/States";
import { useData } from "../../data/DataProvider";
import { useEvent, useLive, useRun } from "../../data/hooks";
import type { EventInfo, Run } from "../../data/types";
import { shortDate } from "../../lib/format";
import { appUrl } from "../../lib/share";
import { Announcements } from "./Announcements";
import { AgendaList, DealFacts, WhatEachBrings } from "./DealDetails";
import { EventStatusPill, EventStatusText } from "./EventStatus";
import { eventPhase } from "./logic";
import { RsvpCard } from "./RsvpCard";
import { ShareCard } from "./ShareCard";

/** /event/:dealId: the public event page with RSVPs, calendar file, sharing and the Bots' announcements. */
export default function EventPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const source = useData();
  const event = useEvent(dealId);
  // Which run and round this deal belongs to. Loaded once: neither changes.
  const version = useLive(dealId ? `deal:${dealId}` : null, () => source.getDeal(dealId!), { topics: [], poll: "never" });
  const run = useRun(version.data?.runId);
  usePageTitle(event.data?.deal.title ?? "Event");

  if (event.loading) return <EventSkeleton />;
  if (!event.data || !dealId) {
    const missing = !dealId || event.errorCode === "not_found" || (event.errorCode === "invalid" && /uuid/i.test(event.error ?? ""));
    if (missing) {
      return (
        <div className="mx-auto max-w-xl px-4 py-24 sm:px-6">
          <EmptyState
            icon={<CalendarX2 size={32} aria-hidden />}
            title="We can't find this event"
            body="The link may be incomplete, or the collab was removed."
            action={
              <Link to="/" className="btn btn-primary">
                Go to the board
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <ErrorState
          title="We couldn't load this event"
          message={event.errorCode === "not_ready" ? "This backend can't show event pages yet (backend not ready)." : (event.error ?? "Something went wrong")}
          onRetry={event.reload}
        />
      </div>
    );
  }

  return (
    <EventView
      info={event.data}
      round={version.data?.round ?? null}
      runId={version.data?.runId ?? null}
      run={run.data ?? null}
      refreshError={event.error}
    />
  );
}

function EventView({ info, round, runId, run, refreshError }: { info: EventInfo; round: number | null; runId: string | null; run: Run | null; refreshError: string | null }) {
  const { present } = useProjector();
  const { deal, dealId } = info;
  const url = appUrl(`/event/${dealId}`);
  const phase = eventPhase({ dealId, allApproved: info.allApproved, round, run });

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of deal.communities) out[c.id] = c.name;
    for (const c of info.communities) out[c.id] = c.name;
    return out;
  }, [deal.communities, info.communities]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="present-hide inline-flex items-center gap-1 text-sm text-muted hover:text-ink print:hidden">
            <ArrowLeft size={14} aria-hidden /> Board
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="eyebrow">Joint event</span>
          <EventStatusPill phase={phase} />
          {round !== null && round > 1 ? <span className="pill border-line text-muted">Round {round}</span> : null}
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-3xl leading-[1.1] sm:text-5xl">{deal.title}</h1>
        <EventStatusText phase={phase} className="mt-3 text-muted" />
        {phase === "replaced" && run?.dealId ? (
          <Link to={`/event/${run.dealId}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Open the latest version <ArrowRight size={14} aria-hidden />
          </Link>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p id="event-hosts" className="text-sm text-muted">
            Hosted by
          </p>
          <ul className="flex flex-wrap items-center gap-2" aria-labelledby="event-hosts">
            {info.communities.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                <Link to={`/c/${c.id}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-medium hover:border-line-strong">
                  <Avatar id={c.id} name={c.name} size={24} />
                  {c.name}
                </Link>
                {c.status === "draft" ? <DraftBadge /> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 border-y border-line py-5">
          <DealFacts deal={deal} layout="row" />
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start print:static" aria-label="RSVP and sharing" data-tour="rsvp">
          <RsvpCard key={dealId} dealId={dealId} deal={deal} phase={phase} count={info.rsvpCount} latestDealId={run?.dealId ?? null} />
          <ShareCard url={url} title={deal.title} text={`${deal.title}. ${shortDate(deal.date)} at ${deal.time}, ${deal.venue}.`} present={present} />
          {refreshError ? (
            <p role="status" className="px-1 text-xs text-warn">
              Couldn't refresh just now ({refreshError}). Retrying…
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-1">
          <section aria-label="About this event">
            <p className="max-w-2xl text-lg leading-relaxed sm:text-xl">{deal.description}</p>
            {runId ? (
              <Link to={`/run/${runId}`} className="present-hide mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline print:hidden">
                See how the Bots negotiated this <ArrowRight size={14} aria-hidden />
              </Link>
            ) : null}
          </section>

          <section aria-labelledby="event-brings">
            <h2 id="event-brings" className="font-display text-2xl leading-tight">
              What each community brings
            </h2>
            <div className="mt-4">
              <WhatEachBrings communities={deal.communities} />
            </div>
          </section>

          <section aria-labelledby="event-agenda">
            <h2 id="event-agenda" className="font-display text-2xl leading-tight">
              Agenda
            </h2>
            <div className="mt-4 max-w-2xl">
              <AgendaList agenda={deal.agenda} />
            </div>
          </section>

          <div className="present-hide print:hidden">
            <Announcements items={info.announcements} names={names} url={url} confirmed={phase === "confirmed"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label="Loading the event">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-8 h-3 w-40" />
      <Skeleton className="mt-4 h-10 w-full max-w-2xl sm:h-12" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-8 grid gap-4 border-y border-line py-5 sm:grid-cols-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="space-y-4 lg:col-start-2 lg:row-start-1">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={2} />
        </div>
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
          <div className="grid gap-3 pt-6 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </div>
  );
}
