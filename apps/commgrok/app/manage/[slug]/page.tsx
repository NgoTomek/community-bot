import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { findEvent, loadEventContext } from "@/lib/workflow";
import { requireTeamPage } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { getSiteUrl } from "@/lib/site";
import { isSupabaseMode } from "@/lib/config";
import { shortDate, timeOf } from "@/lib/time";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CancelEvent } from "@/components/CancelEvent";
import { EventQr } from "@/components/EventQr";
import { DateTile, EventStatusPill, Header, Page, SectionLabel, btn, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guest list" };

export default async function Manage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireTeamPage(`/manage/${slug}`);
  const ev = await findEvent(slug);
  if (!ev) notFound();
  const [ctx, site] = await Promise.all([loadEventContext(ev), getSiteUrl()]);
  const guests = [...ctx.rsvps].filter((r) => r.status !== "cancelled").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const going = guests.filter((g) => g.status === "going").length;
  const waitlist = guests.length - going;
  const url = `${site}/e/${ev.slug}`;

  return (
    <>
      <Header right={<UserMenu />} />
      <Page>
        <Link href="/approvals?tab=published" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Approvals
        </Link>
        <div className="flex items-start gap-3">
          <DateTile iso={ev.start_at} tz={ev.timezone} type={ev.event_type} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight tracking-tight">{ev.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <EventStatusPill status={ev.status} />
              {shortDate(ev.start_at, ev.timezone)} · {timeOf(ev.start_at, ev.timezone)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Going", going],
            ["Waitlist", waitlist],
            ["Capacity", ev.capacity ?? "∞"],
          ].map(([label, n]) => (
            <div key={label} className="rounded-2xl border border-line bg-card py-3">
              <div className="text-2xl font-bold">{n}</div>
              <div className="text-xs font-medium text-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ev.status === "published" && (
            <Link href={`/e/${ev.slug}`} className={btn.small}>
              <ExternalLink aria-hidden className="size-4" /> Event page
            </Link>
          )}
          <a href={`/manage/${ev.slug}/guests.csv`} className={btn.small}>
            <Download aria-hidden className="size-4" /> Export CSV
          </a>
          {ev.status === "published" && <EventQr url={url} />}
        </div>

        <section className="mt-8">
          <SectionLabel>Guests ({guests.length})</SectionLabel>
          {guests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No RSVPs yet. Share the link to get the first one.</div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{g.name}</div>
                    <div className="truncate text-sm text-muted">{g.email}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cx("text-xs font-semibold", g.status === "going" ? "text-ok" : "text-warn")}>{g.status === "going" ? "Going" : "Waitlist"}</span>
                    <div className="text-xs text-muted">
                      {shortDate(g.created_at, ev.timezone)}, {timeOf(g.created_at, ev.timezone)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ev.status === "published" && (
          <section className="mt-10">
            <SectionLabel>Danger zone</SectionLabel>
            <CancelEvent eventId={ev.id} />
          </section>
        )}
      </Page>
      <LiveRefresh mode={isSupabaseMode() ? "supabase" : "local"} />
    </>
  );
}
