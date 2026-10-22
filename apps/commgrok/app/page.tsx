import Link from "next/link";
import { CalendarPlus, Download, Sparkles } from "lucide-react";
import { loadCalendar } from "@/lib/workflow";
import { getSiteUrl } from "@/lib/site";
import { dayHeading, dayKey, weekdayLong, DEFAULT_TZ } from "@/lib/time";
import { CALENDAR_DESCRIPTION, CALENDAR_NAME, isSupabaseMode } from "@/lib/config";
import { EventRow } from "@/components/EventRow";
import { LiveRefresh } from "@/components/LiveRefresh";
import { UserMenu } from "@/components/UserMenu";
import { Glow, Header, Logo, Page, Tabs, TYPE_LABEL, TYPE_STYLE, btn, cx } from "@/components/ui";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = { tab?: string; type?: string; community?: string };

function href(sp: SP, patch: Partial<SP>) {
  const next = { ...sp, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export default async function CalendarHome({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { upcoming, past } = await loadCalendar();
  const site = await getSiteUrl();
  const webcal = `webcal://${site.replace(/^https?:\/\//, "")}/calendar.ics`;
  const tab = sp.tab === "past" ? "past" : "upcoming";
  const base = tab === "past" ? past : upcoming;

  const types = [...new Set(base.map((r) => r.event.event_type))] as EventType[];
  const communities = [...new Set(base.flatMap((r) => r.event.communities))].sort();
  const rows = base.filter(
    (r) => (!sp.type || r.event.event_type === sp.type) && (!sp.community || r.event.communities.includes(sp.community)),
  );

  const groups: { key: string; iso: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const k = dayKey(r.event.start_at, r.event.timezone);
    const g = groups.find((x) => x.key === k);
    if (g) g.items.push(r);
    else groups.push({ key: k, iso: r.event.start_at, items: [r] });
  }

  return (
    <>
      <Header right={<UserMenu />} />
      <Page>
        <section className="relative isolate pb-7 pt-5">
          <Glow className="-inset-x-4 -top-24 bottom-0" />
          <Logo size={64} />
          <h1 className="mt-5 text-[30px] font-bold leading-[1.1] tracking-tight sm:text-[34px]">{CALENDAR_NAME}</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{CALENDAR_DESCRIPTION}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={webcal} className={btn.primary}>
              <CalendarPlus aria-hidden className="size-4.5" /> Subscribe
            </a>
            <a href="/calendar.ics" className={btn.secondary} download>
              <Download aria-hidden className="size-4.5" /> .ics
            </a>
          </div>
        </section>

        <Tabs
          active={tab}
          tabs={[
            { key: "upcoming", label: "Upcoming", href: href({}, {}), count: upcoming.length },
            { key: "past", label: "Past", href: href({}, { tab: "past" }) },
          ]}
        />

        {(types.length > 1 || communities.length > 1) && (
          <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <FilterChip href={href(sp, { type: undefined, community: undefined })} active={!sp.type && !sp.community}>
              All
            </FilterChip>
            {types.map((t) => (
              <FilterChip key={t} href={href(sp, { type: sp.type === t ? undefined : t })} active={sp.type === t}>
                <span aria-hidden className={cx("size-2 rounded-full", TYPE_STYLE[t].dot)} />
                {TYPE_LABEL[t]}
              </FilterChip>
            ))}
            {communities.map((c) => (
              <FilterChip key={c} href={href(sp, { community: sp.community === c ? undefined : c })} active={sp.community === c}>
                {c}
              </FilterChip>
            ))}
          </div>
        )}

        <div className="mt-6">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <div aria-hidden className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
                <Sparkles className="size-6" />
              </div>
              <p className="font-semibold">{tab === "past" ? "No past events yet" : "Nothing scheduled yet"}</p>
              <p className="mt-1 text-sm text-muted">New events appear here as soon as the organisers approve them.</p>
              <p className="mt-2 text-sm text-muted">
                {tab === "past" ? "History is still being written. Slowly, over coffee." : "Quieter than the Tube on Christmas Day."}
              </p>
            </div>
          ) : (
            <ol className="relative">
              {groups.map((g) => (
                <li key={g.key} className="relative pb-6 pl-5">
                  <span aria-hidden className="absolute left-[3px] top-2.5 bottom-0 w-px border-l border-dashed border-line" />
                  <span aria-hidden className="absolute -left-[1.5px] top-[5.5px] size-[10px] rounded-full bg-brand ring-[3px] ring-bg" />
                  <h2 className="mb-2.5 text-[15px] font-semibold">
                    {dayHeading(g.iso, DEFAULT_TZ)}{" "}
                    <span className="font-normal text-muted">{weekdayLong(g.iso, DEFAULT_TZ)}</span>
                  </h2>
                  <div className="space-y-2.5">
                    {g.items.map((r) => (
                      <EventRow key={r.event.id} event={r.event} rsvp={r.rsvp} past={tab === "past"} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Page>
      <LiveRefresh mode={isSupabaseMode() ? "supabase" : "local"} />
    </>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-[scale,background-color,border-color,color] duration-150 active:scale-[0.96]",
        active ? "border-fg bg-fg text-bg" : "border-line bg-card text-muted hover:border-accent/40 hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
