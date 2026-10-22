import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { findEvent, loadEventContext } from "@/lib/workflow";
import { requireTeamPage } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { isSupabaseMode } from "@/lib/config";
import { normalizeStatus } from "@/lib/types";
import { EventDetail } from "@/components/EventDetail";
import { ReviewShell } from "@/components/ReviewShell";
import { ReviewActions } from "@/components/ReviewActions";
import { ApprovalPanel, DecisionStatusCard, resolveNote } from "@/components/ApprovalPanel";
import { Timeline } from "@/components/Timeline";
import { LiveRefresh } from "@/components/LiveRefresh";
import { EventStatusPill, Header, Page, ProgressDots, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review proposal" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireTeamPage(`/approvals/${id}`);
  const ev = await findEvent(id);
  if (!ev) notFound();
  const ctx = await loadEventContext(ev);
  const status = normalizeStatus(ev.status);
  const latestNote = resolveNote(ctx.latestNote, ctx.approval);
  const mine = ctx.approval.rows.find((r) => r.team.id === session.teamId) ?? null;
  const waitingOn = ctx.approval.rows.filter((r) => r.team.id !== session.teamId && r.state !== "approved").map((r) => r.team.name);
  const open = status === "proposed" || status === "renegotiating";
  const stale = mine?.state === "stale";

  return (
    <>
      <Header right={<UserMenu />} />
      <Page>
        <Link href="/approvals" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Approvals
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <EventStatusPill status={status} />
          {open && <ProgressDots approved={ctx.approval.approved} required={ctx.approval.required} />}
          {ev.source === "bot" && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted">
              <Bot aria-hidden className="size-3.5" /> Proposed by bots{ev.revision > 1 ? ` · v${ev.revision}` : ""}
            </span>
          )}
        </div>

        <DecisionStatusCard status={status} note={latestNote} stale={stale} revision={ev.revision} />

        <ReviewShell event={ev} canEdit={open && !!mine}>
          <EventDetail event={ev} rsvp={ctx.rsvp} />
        </ReviewShell>

        <section className="mt-8">
          <SectionLabel>Teams</SectionLabel>
          <ApprovalPanel approval={ctx.approval} myTeamId={session.teamId} />
        </section>

        <section className="mt-8">
          <SectionLabel>Activity</SectionLabel>
          <Timeline log={ctx.log} />
        </section>
      </Page>
      <ReviewActions
        eventId={ev.id}
        slug={ev.slug}
        title={ev.title}
        status={status}
        myState={mine?.state ?? null}
        waitingOn={waitingOn}
        revision={ev.revision}
      />
      <LiveRefresh mode={isSupabaseMode() ? "supabase" : "local"} />
    </>
  );
}
