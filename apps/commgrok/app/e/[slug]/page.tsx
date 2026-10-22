import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Settings2 } from "lucide-react";
import { findEvent, loadEventContext, absoluteUrl } from "@/lib/workflow";
import { getSiteUrl } from "@/lib/site";
import { getSession } from "@/lib/session";
import { UserMenu } from "@/components/UserMenu";
import { googleCalendarUrl } from "@/lib/links";
import { isPast } from "@/lib/time";
import { isSupabaseMode } from "@/lib/config";
import { EventDetail } from "@/components/EventDetail";
import { RegisterBar } from "@/components/RegisterBar";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Header, Page, btn } from "@/components/ui";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ev = await findEvent(slug);
  if (!ev || !isPublic(ev.status)) return { title: "Event" };
  const site = await getSiteUrl();
  const img = absoluteUrl(site, ev.cover_url);
  return {
    title: ev.title,
    description: ev.description_md.slice(0, 160).replace(/[*_#>`]/g, ""),
    openGraph: { title: ev.title, images: img ? [img] : undefined },
  };
}

/** Public only: published events, plus cancelled ones (shown as cancelled). Proposed, renegotiating and rejected 404. */
const isPublic = (status: string) => status === "published" || status === "cancelled";

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const ev = await findEvent(slug);
  if (!ev || !isPublic(ev.status)) notFound();
  const [ctx, site, session] = await Promise.all([loadEventContext(ev), getSiteUrl(), getSession()]);
  const url = `${site}/e/${ev.slug}`;
  const state =
    ev.status === "cancelled" ? "cancelled" : isPast(ev.end_at) ? "ended" : ev.capacity != null && ctx.rsvp.going >= ev.capacity ? "full" : "open";

  return (
    <>
      <Header
        right={
          <div className="flex items-center gap-2">
            {/* Manage is for logged-in organisers only; guests see just the login button. */}
            {session?.teamId ? (
              <Link href={`/manage/${ev.slug}`} className={btn.small}>
                <Settings2 aria-hidden className="size-4" /> Manage
              </Link>
            ) : null}
            <UserMenu next={`/e/${ev.slug}`} compact={!!session?.teamId} />
          </div>
        }
      />
      <Page>
        <Link href="/" className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Calendar
        </Link>
        {state === "cancelled" && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">
            <Ban aria-hidden className="size-4" /> This event has been cancelled.
          </div>
        )}
        {state === "ended" && (
          <div className="mb-4 rounded-2xl bg-subtle px-4 py-3 text-sm font-medium text-muted">This event has ended. Thanks to everyone who came.</div>
        )}
        <EventDetail event={ev} rsvp={ctx.rsvp} />
      </Page>
      <RegisterBar
        eventId={ev.id}
        title={ev.title}
        state={state}
        url={url}
        icsUrl={`/e/${ev.slug}/ics`}
        googleUrl={googleCalendarUrl(ev, site)}
      />
      <LiveRefresh mode={isSupabaseMode() ? "supabase" : "local"} />
    </>
  );
}
