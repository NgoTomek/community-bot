import type { Deal } from "@community-bots/core";
import { CalendarDays, Check, MapPin, Users } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import { RolePill } from "../../components/Badges";
import { longDate } from "../../lib/format";

/** Date and time, venue and capacity. "row" puts them side by side from the sm breakpoint. */
export function DealFacts({ deal, layout = "list" }: { deal: Pick<Deal, "date" | "time" | "venue" | "capacity">; layout?: "list" | "row" }) {
  const facts = [
    {
      icon: CalendarDays,
      label: "When",
      value: (
        <>
          {longDate(deal.date)}
          <span className="text-faint"> · </span>
          <span className="tabular">{deal.time}</span>
        </>
      ),
    },
    { icon: MapPin, label: "Where", value: deal.venue },
    { icon: Users, label: "How many", value: `Up to ${deal.capacity} people` },
  ];
  return (
    <dl className={layout === "row" ? "grid gap-x-8 gap-y-4 sm:grid-cols-3" : "space-y-3"}>
      {facts.map(({ icon: Icon, label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="eyebrow flex items-center gap-1.5">
            <Icon size={14} aria-hidden />
            {label}
          </dt>
          <dd className="mt-1 font-medium leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WhatEachBrings({ communities, columns = 2 }: { communities: Deal["communities"]; columns?: 1 | 2 }) {
  if (!communities.length) return <p className="text-sm text-muted">No communities listed yet.</p>;
  return (
    <ul className={`grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {communities.map((c) => (
        <li key={c.id} className="card p-4">
          <div className="flex items-center gap-2.5">
            <Avatar id={c.id} name={c.name} size={28} />
            <p className="min-w-0 flex-1 truncate font-medium">{c.name}</p>
            <RolePill role={c.role} />
          </div>
          {c.brings.length ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {c.brings.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check size={14} className="mt-[3px] shrink-0 text-ok" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing listed yet.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AgendaList({ agenda }: { agenda: Deal["agenda"] }) {
  if (!agenda.length) return <p className="text-sm text-muted">No agenda yet.</p>;
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {agenda.map((entry, i) => (
        <li key={`${entry.time}-${i}`} className="flex gap-4 px-4 py-3">
          <span className="tabular w-12 shrink-0 font-semibold">{entry.time}</span>
          <span className="min-w-0">{entry.item}</span>
        </li>
      ))}
    </ol>
  );
}
