import type { Card } from "@community-bots/core";
import { CalendarDays, CircleCheck, CircleMinus, CircleX, Clock, ExternalLink, MapPin, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../components/Avatar";
import { RolePill } from "../../components/Badges";
import { Skeleton } from "../../components/ui/States";
import type { DealVersion, Run } from "../../data/types";
import { checkDealConstraints } from "../../lib/constraints";
import { diffDeals, summarizeDiff } from "../../lib/dealDiff";
import { longDate, shortDate } from "../../lib/format";

const DEAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: "Out for approval", cls: "bg-warn-soft text-warn border-warn/25" },
  changes_requested: { label: "Changes requested", cls: "bg-sunken text-muted border-line" },
  confirmed: { label: "Confirmed", cls: "bg-ok-soft text-ok border-ok/25" },
  declined: { label: "Declined", cls: "bg-bad-soft text-bad border-bad/25" },
};

/** The deal draft with a round selector; fields that changed since the previous round are highlighted. */
export function DealPanel({
  run,
  deals,
  loading,
  cards,
  names,
  selectedRound,
  onSelectRound,
}: {
  run: Run;
  deals: DealVersion[];
  loading: boolean;
  cards: Record<string, Card | undefined>;
  names: Record<string, string>;
  selectedRound: number | null;
  onSelectRound: (round: number) => void;
}) {
  const latest = deals[deals.length - 1];
  const version = deals.find((d) => d.round === selectedRound) ?? latest;
  const previous = version ? deals.filter((d) => d.round < version.round).pop() : undefined;
  const diff = useMemo(() => (version ? diffDeals(previous?.deal, version.deal) : null), [version, previous]);

  if (loading && !deals.length) {
    return (
      <section className="card space-y-3 p-5" aria-label="Deal draft">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </section>
    );
  }

  if (!version || !diff) {
    return (
      <section className="card p-5" aria-label="Deal draft">
        <p className="eyebrow">Deal draft</p>
        <p className="mt-3 font-medium">No deal yet</p>
        <p className="mt-1 text-sm text-muted">
          {run.status === "negotiating" || run.status === "compiling"
            ? "The Bots are still negotiating. The Scribe compiles a deal from what they agree, and it appears here."
            : "This collab ended before a deal was compiled."}
        </p>
      </section>
    );
  }

  const deal = version.deal;
  const status = DEAL_STATUS[version.status] ?? DEAL_STATUS.pending_approval;
  const removed = previous ? previous.deal.communities.filter((c) => diff.communities.removed.includes(c.id)) : [];

  return (
    <section className="card overflow-hidden" aria-label="Deal draft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="eyebrow">Deal draft</p>
        <span className={`pill ${status.cls}`}>{status.label}</span>
      </div>

      {deals.length > 1 ? (
        <div className="border-b border-line px-5 py-3">
          <div className="segmented" role="radiogroup" aria-label="Round">
            {deals.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={d.round === version.round} onClick={() => onSelectRound(d.round)}>
                Round {d.round}
              </button>
            ))}
          </div>
          {previous ? (
            <p className="mt-2 text-sm text-muted">
              {diff.count ? (
                <>
                  <span className="changed px-1.5 py-0.5 text-ink">Highlighted</span> since round {previous.round}: {summarizeDiff(diff)}.
                </>
              ) : (
                `Nothing changed since round ${previous.round}.`
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5 px-5 py-5">
        <div>
          <Changed on={!!diff.fields.title} before={diff.fields.title?.before}>
            <h2 className="font-display text-xl leading-snug">{deal.title}</h2>
          </Changed>
          <Changed on={!!diff.fields.description} className="mt-2">
            <p className="text-sm leading-relaxed text-muted">{deal.description}</p>
          </Changed>
        </div>

        <dl className="space-y-2.5 text-sm">
          <Fact icon={CalendarDays} label="Date" changed={diff.fields.date ? shortDate(diff.fields.date.before) : null}>
            {longDate(deal.date)}
          </Fact>
          <Fact icon={Clock} label="Time" changed={diff.fields.time?.before ?? null}>
            <span className="tabular">{deal.time}</span>
          </Fact>
          <Fact icon={MapPin} label="Venue" changed={diff.fields.venue?.before ?? null}>
            {deal.venue}
          </Fact>
          <Fact icon={Users} label="Capacity" changed={diff.fields.capacity ? `${diff.fields.capacity.before} people` : null}>
            Up to {deal.capacity} people
          </Fact>
        </dl>

        <div>
          <h3 className="eyebrow mb-3">Who brings what</h3>
          <ul className="space-y-3">
            {deal.communities.map((c) => {
              const change = diff.communities.changed[c.id];
              const isNew = diff.communities.added.includes(c.id);
              return (
                <li key={c.id} className={`flex gap-3 ${isNew ? "changed p-2" : ""}`}>
                  <Avatar id={c.id} name={names[c.id] ?? c.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{names[c.id] ?? c.name}</span>
                      <span className={change?.role ? "changed px-1" : ""}>
                        <RolePill role={c.role} />
                      </span>
                      {isNew ? <span className="text-xs text-warn">New this round</span> : null}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-sm text-muted">
                      {c.brings.map((b) => (
                        <li key={b} className={change?.addedBrings.includes(b) ? "changed px-1.5 text-ink" : ""}>
                          {b}
                        </li>
                      ))}
                      {change?.removedBrings.map((b) => (
                        <li key={`x:${b}`} className="text-faint line-through">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
            {removed.map((c) => (
              <li key={`removed:${c.id}`} className="flex gap-3 text-sm text-faint">
                <span className="opacity-50">
                  <Avatar id={c.id} name={c.name} size={28} />
                </span>
                <span className="pt-1 line-through">{c.name} left this round</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="eyebrow mb-3">Agenda</h3>
          <ol className="space-y-1 text-sm">
            {deal.agenda.map((a) => {
              const added = diff.agenda.added.includes(`${a.time.trim()} ${a.item.trim()}`);
              return (
                <li key={`${a.time}-${a.item}`} className={`flex gap-3 ${added ? "changed px-1.5 py-0.5" : ""}`}>
                  <span className="w-12 shrink-0 tabular text-muted">{a.time}</span>
                  <span>{a.item}</span>
                </li>
              );
            })}
            {diff.agenda.removed.map((k) => (
              <li key={`x:${k}`} className="flex gap-3 text-faint line-through">
                <span className="w-12 shrink-0 tabular">{k.split(" ")[0]}</span>
                <span>{k.split(" ").slice(1).join(" ")}</span>
              </li>
            ))}
          </ol>
        </div>

        <Checks deal={deal} cards={cards} />

        <Link to={`/event/${version.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          {version.status === "confirmed" ? "Open the event page" : "Preview the event page"} <ExternalLink size={13} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function Changed({ on, before, className = "", children }: { on: boolean; before?: string; className?: string; children: ReactNode }) {
  if (!on) return <div className={className}>{children}</div>;
  return (
    <div className={`changed -mx-1.5 px-1.5 py-0.5 ${className}`}>
      {children}
      {before ? <p className="mt-0.5 text-xs text-muted line-through">{before}</p> : null}
    </div>
  );
}

function Fact({ icon: Icon, label, changed, children }: { icon: typeof Clock; label: string; changed: string | null; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 ${changed ? "changed -mx-1.5 px-1.5 py-1" : ""}`}>
      <Icon size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0">
        {children}
        {changed ? (
          <span className="ml-2 text-xs text-muted">
            was <span className="line-through">{changed}</span>
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** Live checks of the deal against the cards, recomputed in the browser. */
export function Checks({ deal, cards }: { deal: DealVersion["deal"]; cards: Record<string, Card | undefined> }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const checks = checkDealConstraints(deal, cards, now);
  const failing = checks.filter((c) => !c.ok).length;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="eyebrow">Checks against the cards</h3>
        <span className={`text-xs ${failing ? "text-bad" : "text-ok"}`}>{failing ? `${failing} failing` : "All pass"}</span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {checks.map((check) => {
          const Icon = !check.ok ? CircleX : check.unknown ? CircleMinus : CircleCheck;
          const cls = !check.ok ? "text-bad" : check.unknown ? "text-faint" : "text-ok";
          return (
            <li key={check.id} className="flex items-start gap-2">
              <Icon size={15} className={`mt-0.5 shrink-0 ${cls}`} aria-hidden />
              <span className={check.ok ? "" : "text-bad"}>
                <span className="sr-only">{!check.ok ? "Fails: " : check.unknown ? "No limit listed: " : "Passes: "}</span>
                {check.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-faint">Computed in your browser from each card's days and maximum group size.</p>
    </div>
  );
}
