import type { Deal } from "@community-bots/core";
import { CalendarDays, Clock, MapPin, MessagesSquare, RotateCcw, Ticket, Users, type LucideIcon } from "lucide-react";
import { useId, type Ref } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { DraftBadge, RolePill, RunStatusPill } from "../../components/Badges";
import type { DealVersion, Run } from "../../data/types";
import { longDate } from "../../lib/format";
import type { ReplayCommunity } from "./model";

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-faint" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="font-medium leading-snug">{value}</dd>
      </div>
    </div>
  );
}

/** Date, time, venue, capacity, who brings what and the agenda of one deal. */
export function DealDetails({ deal, communities, names }: { deal: Deal; communities: ReplayCommunity[]; names: Record<string, string> }) {
  const statusOf = (id: string) => communities.find((c) => c.id === id)?.status ?? null;
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact icon={CalendarDays} label="Date" value={longDate(deal.date)} />
        <Fact icon={Clock} label="Starts" value={deal.time} />
        <Fact icon={MapPin} label="Venue" value={deal.venue} />
        <Fact icon={Users} label="Capacity" value={`Up to ${deal.capacity} people`} />
      </dl>

      <section>
        <h3 className="eyebrow">Who brings what</h3>
        <ul className="mt-3 divide-y divide-line">
          {deal.communities.map((c) => {
            const name = names[c.id] ?? c.name;
            return (
              <li key={c.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar id={c.id} name={name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{name}</span>
                    <RolePill role={c.role} />
                    {statusOf(c.id) === "draft" ? <DraftBadge /> : null}
                  </div>
                  {c.brings.length ? (
                    <ul className="mt-1 space-y-0.5 text-sm text-muted">
                      {c.brings.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {deal.agenda.length ? (
        <section>
          <h3 className="eyebrow">Agenda</h3>
          <ol className="mt-3 space-y-2">
            {deal.agenda.map((a, i) => (
              <li key={`${a.time}:${i}`} className="flex gap-4 text-sm">
                <span className="w-12 shrink-0 tabular text-muted">{a.time}</span>
                <span>{a.item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** Shown when the replay reaches the end: the final deal and where to go next. */
export function ReplayEnd({
  run,
  deal,
  communities,
  names,
  threadRunId,
  eventDealId,
  onRestart,
  sectionRef,
}: {
  run: Run;
  deal: DealVersion | null;
  communities: ReplayCommunity[];
  names: Record<string, string>;
  threadRunId: string | null;
  eventDealId: string | null;
  onRestart: () => void;
  sectionRef?: Ref<HTMLElement>;
}) {
  const titleId = useId();
  return (
    <section ref={sectionRef} aria-labelledby={titleId} className="card mt-8 scroll-mb-32 scroll-mt-40 overflow-hidden sm:scroll-mb-8">
      <div className="space-y-2 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow">End of the recording</p>
          <RunStatusPill run={run} />
        </div>
        <h2 id={titleId} className="font-display text-2xl leading-tight sm:text-3xl">
          {deal ? deal.deal.title : "No deal was compiled"}
        </h2>
        {deal ? <p className="text-muted">{deal.deal.description}</p> : null}
        {run.status === "declined" && run.declineReason ? <p className="text-sm text-muted">Declined: “{run.declineReason}”</p> : null}
        {!deal ? <p className="text-muted">The Bots did not reach a deal in this run, so there is no event to show.</p> : null}
      </div>
      {deal ? (
        <div className="px-5 py-5 sm:px-6">
          <DealDetails deal={deal.deal} communities={communities} names={names} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-4 sm:px-6">
        {threadRunId ? (
          <Link to={`/run/${threadRunId}`} className="btn btn-primary">
            <MessagesSquare size={16} aria-hidden />
            Open the live thread
          </Link>
        ) : null}
        {eventDealId ? (
          <Link to={`/event/${eventDealId}`} className="btn">
            <Ticket size={16} aria-hidden />
            Event page
          </Link>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          <RotateCcw size={16} aria-hidden />
          Watch again
        </button>
      </div>
    </section>
  );
}
