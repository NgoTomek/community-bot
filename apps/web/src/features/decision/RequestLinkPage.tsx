import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, CircleSlash, Link2Off, Loader2, MessagesSquare } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "../../app/title";
import { Avatar } from "../../components/Avatar";
import { ApprovalPill, SampleBadge, YouTag } from "../../components/Badges";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "../../components/ui/States";
import { useData } from "../../data/DataProvider";
import { useLive, useNow, useRequestDetail, useRun } from "../../data/hooks";
import type { ApprovalStatus, RequestDetail, Run } from "../../data/types";
import { joinNames, relativeTime } from "../../lib/format";
import { AgendaList, DealFacts, WhatEachBrings } from "../event/DealDetails";
import { DecisionForm } from "./DecisionForm";

/** /r/:token: one organiser's approval page, phone first. Phone links fall back to it. */
export default function RequestLinkPage() {
  const { token } = useParams<{ token: string }>();
  const source = useData();
  const request = useRequestDetail(token);
  const dealId = request.data?.dealId;
  // The run behind this deal, for the thread link and to know whether the Bots are still talking.
  const version = useLive(dealId ? `deal:${dealId}` : null, () => source.getDeal(dealId!), { topics: [], poll: "never" });
  const run = useRun(version.data?.runId);
  usePageTitle(request.data?.deal?.title ?? "Your decision");

  if (request.loading) return <RequestSkeleton />;
  if (!request.data || !token) {
    const invalid = !token || request.errorCode === "not_found" || (request.errorCode === "invalid" && /uuid/i.test(request.error ?? ""));
    if (invalid) {
      return (
        <Page>
          <EmptyState
            icon={<Link2Off size={32} aria-hidden />}
            title="This approval link is not valid"
            body="Check that you opened the whole link. If it still fails, ask the organiser who sent it for a fresh one."
            action={
              <Link to="/" className="btn btn-primary">
                Go to the board
              </Link>
            }
          />
        </Page>
      );
    }
    return (
      <Page>
        <ErrorState
          title="We couldn't load this request"
          message={request.errorCode === "not_ready" ? "This backend can't show approval links yet (backend not ready)." : (request.error ?? "Something went wrong")}
          onRetry={request.reload}
        />
      </Page>
    );
  }

  return <RequestView request={request.data} token={token} runId={version.data?.runId ?? null} run={run.data ?? null} refreshError={request.error} />;
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">{children}</div>;
}

function RequestView({ request, token, runId, run, refreshError }: { request: RequestDetail; token: string; runId: string | null; run: Run | null; refreshError: string | null }) {
  const source = useData();
  const now = useNow();
  const { deal, community, round, status, note, others, history, dealId } = request;
  const sample = source.kind === "mock" || run?.backend === "mock";

  const inDeal = useMemo(() => (deal ? new Set(deal.communities.map((c) => c.id)) : null), [deal]);
  const current = others.filter((o) => !inDeal || inDeal.has(o.communityId));
  const declinedBy = current.find((o) => o.status === "declined");
  const ended = run?.status === "declined" || !!declinedBy || run?.control === "stopped";
  // Someone asked for changes before this organiser decided: the next round replaces this one.
  const negotiating = !!run && (run.status === "negotiating" || run.status === "compiling");

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">For {community.name}</p>
        {sample ? <SampleBadge compact /> : null}
      </div>

      {deal ? (
        <>
          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{deal.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="pill border-line text-muted">Round {round}</span>
            <ApprovalPill status={status} />
          </div>
          <p className="mt-4 leading-relaxed">{deal.description}</p>
          <div className="card mt-5 p-4">
            <DealFacts deal={deal} />
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">The Bots are still working on this round</h1>
          <p className="mt-3 flex items-center gap-2 text-muted" role="status">
            <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
            Round {round}. This page updates by itself when there is a deal to decide on.
          </p>
        </>
      )}

      <AnimatePresence initial={false} mode="wait">
        <motion.section
          key={`${status}:${round}:${ended}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-6"
          aria-label="Your decision"
        >
          {status === "pending" && ended ? (
            <div className="card p-4 sm:p-5">
              <p className="flex items-center gap-2 font-semibold">
                <CircleSlash size={18} className="shrink-0 text-bad" aria-hidden />
                {run?.control === "stopped" ? "This collab was stopped" : "This collab has ended"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {declinedBy ? `${declinedBy.name} declined, so there is nothing left to decide.` : "There is nothing left to decide."}
              </p>
              <Links runId={runId} dealId={dealId} showEvent={false} />
            </div>
          ) : status === "pending" && deal ? (
            <div className="card border-accent/40! p-4 sm:p-5">
              {negotiating ? <p className="mb-3 text-sm text-muted">The Bots are negotiating a new round. You can decide once they finish.</p> : null}
              <DecisionForm
                token={token}
                round={round}
                label={`Your decision for ${community.name}`}
                disabledReason={negotiating ? "the Bots are still negotiating" : null}
              />
              {runId ? (
                <Link to={`/run/${runId}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  Read how the Bots got here <ArrowRight size={14} aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : status !== "pending" ? (
            <Decided request={request} current={current} runId={runId} />
          ) : null}
        </motion.section>
      </AnimatePresence>

      <section className="mt-10" aria-labelledby="where-everyone-stands">
        <h2 id="where-everyone-stands" className="eyebrow">
          Where everyone stands
        </h2>
        <ul className="card mt-3 divide-y divide-line" aria-live="polite">
          <StatusRow id={community.id} name={community.name} status={status} note={note} you />
          {others.map((o) => (
            <StatusRow key={o.communityId} id={o.communityId} name={o.name} status={o.status} note={o.note} outOfRound={!!inDeal && !inDeal.has(o.communityId)} />
          ))}
        </ul>
      </section>

      {deal ? (
        <>
          <section className="mt-10" aria-labelledby="request-brings">
            <h2 id="request-brings" className="eyebrow">
              What each community brings
            </h2>
            <div className="mt-3">
              <WhatEachBrings communities={deal.communities} columns={1} />
            </div>
          </section>
          <section className="mt-10" aria-labelledby="request-agenda">
            <h2 id="request-agenda" className="eyebrow">
              Agenda
            </h2>
            <div className="mt-3">
              <AgendaList agenda={deal.agenda} />
            </div>
          </section>
        </>
      ) : null}

      <section className="mt-10" aria-labelledby="request-history">
        <h2 id="request-history" className="eyebrow">
          Your decisions so far
        </h2>
        {history.length ? (
          <ol className="mt-3 space-y-4">
            {history.map((h, i) => (
              <li key={`${h.round}-${h.at}-${i}`} className="flex gap-3">
                <span className="tabular w-16 shrink-0 pt-0.5 text-sm text-muted">Round {h.round}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ApprovalPill status={h.decision} />
                    <time dateTime={h.at} className="text-xs text-faint">
                      {relativeTime(h.at, now)}
                    </time>
                  </div>
                  {h.note ? <p className="mt-1.5 text-sm">“{h.note}”</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing decided yet.</p>
        )}
      </section>

      {refreshError ? (
        <p role="status" className="mt-8 text-xs text-warn">
          Couldn't refresh just now ({refreshError}). Retrying…
        </p>
      ) : null}
    </Page>
  );
}

const DECIDED_TITLE: Record<Exclude<ApprovalStatus, "pending">, (round: number) => string> = {
  approved: (round) => `You approved round ${round}`,
  renegotiate: (round) => `You asked the Bots to renegotiate round ${round}`,
  declined: () => "You declined this collab",
};

function Decided({ request, current, runId }: { request: RequestDetail; current: RequestDetail["others"]; runId: string | null }) {
  const { status, note, round, dealId } = request;
  if (status === "pending") return null;
  const waiting = current.filter((o) => o.status === "pending").map((o) => o.name);
  const askedForChanges = current.filter((o) => o.status === "renegotiate").map((o) => o.name);
  const declinedBy = current.find((o) => o.status === "declined");
  const everyoneApproved = status === "approved" && current.every((o) => o.status === "approved");

  let next: string;
  if (status === "declined") next = "The collab has ended for everyone. The other organisers can see your note.";
  else if (declinedBy) next = `${declinedBy.name} declined, so this collab has ended.`;
  else if (status === "renegotiate") next = "The Bots will come back with a new round. This page updates by itself.";
  else if (everyoneApproved) next = "Everyone approved. The event is confirmed and open for RSVPs.";
  else if (askedForChanges.length) next = `${joinNames(askedForChanges)} asked for changes, so the Bots will negotiate a new round.`;
  else if (waiting.length) next = `Waiting for ${joinNames(waiting)}.`;
  else next = "Waiting for the other organisers.";

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{DECIDED_TITLE[status](round)}</p>
        <ApprovalPill status={status} />
      </div>
      {note ? <p className="mt-2 border-l-2 border-line-strong pl-3 text-sm">“{note}”</p> : null}
      <p className="mt-3 text-sm text-muted">{next}</p>
      <Links runId={runId} dealId={dealId} showEvent={status !== "declined" && !declinedBy} primaryEvent={everyoneApproved} />
    </div>
  );
}

function Links({ runId, dealId, showEvent, primaryEvent = false }: { runId: string | null; dealId: string; showEvent: boolean; primaryEvent?: boolean }) {
  if (!runId && !showEvent) return null;
  return (
    <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
      {runId ? (
        <Link to={`/run/${runId}`} className="btn">
          <MessagesSquare size={16} aria-hidden />
          Open the thread
        </Link>
      ) : null}
      {showEvent ? (
        <Link to={`/event/${dealId}`} className={`btn ${primaryEvent ? "btn-primary" : ""}`}>
          <CalendarDays size={16} aria-hidden />
          Event page
        </Link>
      ) : null}
    </div>
  );
}

function StatusRow({ id, name, status, note, you = false, outOfRound = false }: { id: string; name: string; status: ApprovalStatus; note: string | null; you?: boolean; outOfRound?: boolean }) {
  return (
    <li className="flex items-start gap-3 p-4">
      <Avatar id={id} name={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 font-medium leading-snug">{name}</p>
          {you ? <YouTag /> : null}
        </div>
        {note && !outOfRound ? <p className="mt-1 text-sm text-muted">“{note}”</p> : null}
      </div>
      {outOfRound ? <span className="pill shrink-0 border-line text-faint">Not in this round</span> : <ApprovalPill status={status} />}
    </li>
  );
}

function RequestSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading the request">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-9 w-5/6" />
        <Skeleton className="mt-3 h-5 w-40" />
        <Skeleton className="mt-5 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-6 space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </Page>
  );
}
