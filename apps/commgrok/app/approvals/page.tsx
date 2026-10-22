import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CalendarDays, Plus } from "lucide-react";
import { loadInbox } from "@/lib/workflow";
import { requireTeamPage } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { getStore } from "@/lib/store";
import { isSupabaseMode } from "@/lib/config";
import { shortDate, timeOf } from "@/lib/time";
import { normalizeStatus, type DecisionNote, type EventStatus } from "@/lib/types";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PulseDot } from "@/components/ReviewActions";
import { resolveNote } from "@/components/ApprovalPanel";
import { Avatar, EventStatusPill, Header, Page, ProgressDots, TYPE_STYLE, Tabs, TypeChip, btn, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals" };

type Raw = Awaited<ReturnType<typeof loadInbox>>[number];
type Item = Raw & { status: EventStatus; note: DecisionNote | null };
type TabKey = "needs" | "bots" | "published" | "rejected";

const TAB_KEYS: TabKey[] = ["needs", "bots", "published", "rejected"];

export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireTeamPage("/approvals");
  const [{ tab: rawTab }, raw, teams] = await Promise.all([searchParams, loadInbox(), getStore().listTeams()]);
  const team = teams.find((t) => t.id === session.teamId);
  if (!team) redirect("/join?next=/approvals");

  const items: Item[] = raw.map((i) => ({
    ...i,
    status: normalizeStatus(i.event.status),
    note: resolveNote(i.latestNote, i.approval),
  }));
  const myState = (i: Item) => i.approval.rows.find((r) => r.team.id === team.id)?.state;
  const byStart = (a: Item, b: Item) => a.event.start_at.localeCompare(b.event.start_at);
  const byUpdated = (a: Item, b: Item) => b.event.updated_at.localeCompare(a.event.updated_at);

  const proposed = items.filter((i) => i.status === "proposed");
  // Mine first: my team is required and hasn't accepted this revision (stale ones float to the top).
  const needsMe = proposed
    .filter((i) => myState(i) !== undefined && myState(i) !== "approved")
    .sort((a, b) => Number(myState(b) === "stale") - Number(myState(a) === "stale") || byStart(a, b));
  const waiting = proposed.filter((i) => !needsMe.includes(i)).sort(byStart);
  const bots = items.filter((i) => i.status === "renegotiating").sort(byUpdated);
  const published = items
    .filter((i) => i.status === "published")
    .sort((a, b) => (b.event.published_at ?? "").localeCompare(a.event.published_at ?? ""));
  const rejected = items.filter((i) => i.status === "rejected").sort(byUpdated);

  const tab: TabKey = rawTab === "changes" ? "bots" : TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "needs";

  return (
    <>
      <Header
        right={
          <div className="flex items-center gap-2">
            <Link href="/approvals/new" className={btn.small}>
              <Plus aria-hidden className="size-4" /> New
            </Link>
            <UserMenu />
          </div>
        }
      />
      <Page>
        <div className="pb-5 pt-4">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Approvals</h1>
          <Link href="/join?next=/approvals" className="mt-1 inline-flex min-h-8 items-center gap-2 text-sm text-muted hover:text-fg">
            <Avatar name={team.name} url={team.avatar_url} size={20} />
            {session.name} · {team.name}
          </Link>
        </div>

        {/* Four tabs must fit at 360px: short labels, tighter padding on the links. */}
        <div className="[&_a]:gap-1 [&_a]:px-1.5 max-sm:[&_a]:text-[13px]">
          <Tabs
            active={tab}
            tabs={[
              { key: "needs", label: "Decide", href: "/approvals", count: needsMe.length },
              { key: "bots", label: "Bots", href: "/approvals?tab=bots", count: bots.length },
              { key: "published", label: "Live", href: "/approvals?tab=published", count: published.length },
              { key: "rejected", label: "Rejected", href: "/approvals?tab=rejected", count: rejected.length },
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {tab === "needs" && "Needs a decision from the organiser teams."}
          {tab === "bots" && "Sent back to the bots with a note. Waiting for a revised version."}
          {tab === "published" && "Published to the public calendar."}
          {tab === "rejected" && "Rejected. Final, never published."}
        </p>

        <div className="mt-4 space-y-2.5">
          {tab === "needs" && (
            <>
              {proposed.length === 0 && <Empty text="All caught up. New proposals from the bots land here." />}
              {needsMe.map((i) => (
                <Card key={i.event.id} item={i} teamId={team.id} />
              ))}
              {waiting.length > 0 && (
                <>
                  <h2 className={cx("text-xs font-semibold uppercase tracking-wider text-muted", needsMe.length > 0 && "pt-4")}>Waiting on other teams</h2>
                  {waiting.map((i) => (
                    <Card key={i.event.id} item={i} teamId={team.id} />
                  ))}
                </>
              )}
            </>
          )}
          {tab === "bots" && (
            <>
              {bots.length === 0 && <Empty text="Nothing with the bots. Send a proposal back with a note and it waits here." />}
              {bots.map((i) => (
                <Card key={i.event.id} item={i} teamId={team.id} />
              ))}
            </>
          )}
          {tab === "published" && (
            <>
              {published.length === 0 && <Empty text="Nothing published yet. Accepted events go live here." />}
              {published.map((i) => (
                <Card key={i.event.id} item={i} teamId={team.id} />
              ))}
            </>
          )}
          {tab === "rejected" && (
            <>
              {rejected.length === 0 && <Empty text="No rejected events. Everyone's getting along." />}
              {rejected.map((i) => (
                <Card key={i.event.id} item={i} teamId={team.id} />
              ))}
            </>
          )}
        </div>
      </Page>
      <LiveRefresh mode={isSupabaseMode() ? "supabase" : "local"} />
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm leading-relaxed text-muted">
      <div aria-hidden className="mx-auto mb-3 size-10 rounded-2xl bg-brand opacity-90 shadow-[0_8px_20px_-10px_rgb(124_58_237/0.7)]" />
      {text}
    </div>
  );
}

function Card({ item, teamId }: { item: Item; teamId: string }) {
  const { event, approval, status, note } = item;
  const mine = approval.rows.find((r) => r.team.id === teamId);
  const others = approval.rows.filter((r) => r.team.id !== teamId && r.state !== "approved");
  const who = note ? note.by : null;

  let hint: React.ReactNode = null;
  let hintTone = "text-muted";
  if (status === "published") hint = `${item.going} going`;
  else if (status === "rejected") {
    hint = note?.note ? `${who ? `${who}: ` : ""}“${note.note}”` : `Rejected${who ? ` by ${who}` : ""} · no reason given`;
    hintTone = "text-bad";
  } else if (status === "renegotiating") {
    hint = (
      <span className="flex min-w-0 items-center gap-1.5">
        <PulseDot className="scale-75" />
        <span className="shrink-0">Waiting for bots…</span>
        {note?.note && <span className="truncate font-normal opacity-90">“{note.note}”</span>}
      </span>
    );
    hintTone = "text-warn";
  } else if (mine?.state === "stale") {
    hint = "Revised — needs your re-approval";
    hintTone = "text-warn";
  } else if (!mine) hint = "Your team isn't needed on this one";
  else if (mine.state === "approved") hint = others.length ? `You accepted · waiting on ${others.map((o) => o.team.name).join(", ")}` : "You accepted";
  else if (event.revision > 1 && note?.decision === "renegotiate") hint = `Revised after: “${note.note}”`;
  else hint = others.length ? `Your call · also waiting on ${others.map((o) => o.team.name).join(", ")}` : "Your call";

  return (
    <Link
      href={status === "published" ? `/manage/${event.slug}` : `/approvals/${event.id}`}
      className="flex gap-3 rounded-2xl border border-line bg-card p-3 transition hover:bg-subtle/60 active:scale-[0.99]"
    >
      {event.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.cover_url} alt="" className={cx("size-[72px] shrink-0 rounded-xl object-cover", status === "rejected" && "grayscale")} />
      ) : (
        <div aria-hidden className={cx("size-[72px] shrink-0 rounded-xl bg-gradient-to-br", TYPE_STYLE[event.event_type].thumb, status === "rejected" && "grayscale")} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {shortDate(event.start_at, event.timezone)} · {timeOf(event.start_at, event.timezone)}
          </span>
          {event.source === "bot" && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">
              <Bot aria-hidden className="size-3" /> Bot{event.revision > 1 ? ` · v${event.revision}` : ""}
            </span>
          )}
        </div>
        <div className={cx("mt-0.5 truncate text-[15px] font-semibold", status === "rejected" && "text-muted")}>{event.title}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <TypeChip type={event.event_type} size="sm" />
          {status === "proposed" ? <ProgressDots approved={approval.approved} required={approval.required} /> : <EventStatusPill status={status} />}
        </div>
        {hint && <div className={cx("mt-1 truncate text-xs font-medium", hintTone)}>{hint}</div>}
      </div>
    </Link>
  );
}
