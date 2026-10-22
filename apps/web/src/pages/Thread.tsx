import { ArrowDown, ArrowLeft, History, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useIdentity } from "../app/identity";
import { usePresenter } from "../app/presenter";
import { usePageTitle } from "../app/title";
import { Avatar, AvatarStack } from "../components/Avatar";
import { ApprovalPill, BackendBadge, RunStatusPill } from "../components/Badges";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "../components/ui/States";
import { useJob } from "../data/hooks";
import type { ApprovalView, Run } from "../data/types";
import { DecisionForm } from "../features/decision/DecisionForm";
import { Composer, type ComposerHandle } from "../features/thread/Composer";
import { DealPanel } from "../features/thread/DealPanel";
import { isActive, PresenterLinks, RunBanner, RunControls, StatusList } from "../features/thread/Panels";
import { Timeline } from "../features/thread/Timeline";
import { useThread, type ThreadData } from "../features/thread/useThread";
import { joinNames, relativeTime } from "../lib/format";

type Tab = "conversation" | "deal";

export default function Thread() {
  const { runId } = useParams();
  const location = useLocation();
  const jobId = (location.state as { jobId?: string } | null)?.jobId ?? null;
  const t = useThread(runId);
  const run = t.run.data;
  const job = useJob(run ? null : jobId);
  const deals = t.deals.data ?? [];
  const latestDeal = deals[deals.length - 1];
  usePageTitle(run ? (latestDeal?.deal.title ?? run.need) : "Collab");

  if (t.run.loading || (!run && jobId && (!job.data || job.data.status === "queued" || job.data.status === "running" || job.data.status === "done"))) {
    return <Starting progress={run ? null : (job.data?.progress ?? null)} />;
  }
  if (!run) {
    if (job.data?.status === "error") {
      return (
        <Page>
          <ErrorState title="The negotiation could not start" message={job.data.error ?? "The worker reported an error."} />
        </Page>
      );
    }
    if (t.run.error) {
      return (
        <Page>
          <ErrorState message={t.run.error} onRetry={t.reload} />
        </Page>
      );
    }
    return (
      <Page>
        <EmptyState
          title="This collab does not exist"
          body="The link may be old, or the run was removed."
          action={
            <Link to="/" className="btn btn-primary">
              Go to the board
            </Link>
          }
        />
      </Page>
    );
  }
  return <ThreadView t={t} run={run} />;
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</div>;
}

function Starting({ progress }: { progress: string | null }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-8 w-2/3" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <div className="card flex items-center gap-3 p-4" role="status" aria-live="polite">
            <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
            <p>
              Starting the negotiation{progress ? `: ${progress}` : ""}…
            </p>
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}

function ThreadView({ t, run }: { t: ThreadData; run: Run }) {
  const { isPresenter } = usePresenter();
  const [tab, setTab] = useState<Tab>("conversation");
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const deals = t.deals.data ?? [];
  const latestDeal = deals[deals.length - 1];

  // Follow the newest round unless the reader picked an older one.
  const roundCount = deals.length;
  useEffect(() => setSelectedRound(null), [roundCount]);

  const participants = useMemo(() => t.participantIds.map((id) => ({ id, name: t.names[id] ?? id })), [t.participantIds, t.names]);
  const statusIds = latestDeal ? latestDeal.deal.communities.map((c) => c.id) : t.participantIds;
  const needsMe = !!t.myRequest && t.myRequest.status === "pending" && run.status === "pending_approval" && run.round === t.myRequest.round;

  const composerReason = run.control === "stopped" ? "this collab was stopped" : run.status === "confirmed" ? "the collab is confirmed" : run.status === "declined" ? "the collab was declined" : run.status === "error" ? "the run failed" : null;

  const { unseen, jumpToEnd } = useAutoScroll(t.messages.data?.length ?? null, t.timeline.length, run.typing);

  const openDeal = (round: number) => {
    setSelectedRound(round);
    setTab("deal");
    if (window.matchMedia("(min-width: 1024px)").matches) {
      document.getElementById("deal-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const steer = () => {
    setTab("conversation");
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const title = latestDeal?.deal.title ?? run.need;
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <header className="pb-6 pt-6 sm:pt-8">
        <Link to="/" className="present-hide inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} aria-hidden /> Board
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h1 className="font-display text-[26px] leading-tight sm:text-[34px]">{title}</h1>
            {latestDeal ? <p className="mt-2 text-muted">{run.need}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                <AvatarStack items={participants} size={24} />
                <span className="text-muted">{joinNames(participants.map((p) => p.name))}</span>
              </span>
              <RunStatusPill run={run} />
              {run.round > 1 ? <span className="pill border-line text-muted">Round {run.round}</span> : null}
              {run.backend !== "mock" ? <BackendBadge backend={run.backend} title="The backend that ran this collab" /> : null}
              <span className="text-faint">Started {relativeTime(run.createdAt)}</span>
            </div>
          </div>
          <Link to={`/replay/${run.id}`} className="btn btn-sm present-hide">
            <History size={14} aria-hidden /> Replay
          </Link>
        </div>
      </header>

      <RunBanner run={run} approvals={t.approvals} names={t.names} />

      <div className="segmented mb-4 lg:hidden" role="tablist" aria-label="Thread view">
        {(["conversation", "deal"] as Tab[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} className="relative h-9" onClick={() => setTab(value)}>
            {value === "conversation" ? "Conversation" : latestDeal ? `Deal · round ${latestDeal.round}` : "Deal"}
            {value === "deal" && needsMe ? <span className="absolute right-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent-bg" aria-label="needs your decision" /> : null}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-10">
        <section id="panel-conversation" data-tour="thread" aria-label="Conversation" className={tab === "conversation" ? "" : "max-lg:hidden"}>
          {needsMe ? (
            <div className="card mb-4 flex items-center gap-3 border-accent/40 bg-accent-soft p-3 lg:hidden">
              <p className="flex-1 text-sm font-medium">Round {run.round} needs your decision</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openDeal(run.round)}>
                Review and decide
              </button>
            </div>
          ) : null}

          {t.messages.loading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : t.messages.error && !t.timeline.length ? (
            <ErrorState message={t.messages.error} onRetry={t.reload} />
          ) : (
            <Timeline items={t.timeline} cards={t.cards} names={t.names} typing={run.typing} myCommunityIds={t.myCommunityId ? [t.myCommunityId] : []} onOpenDeal={openDeal} />
          )}
          {!t.messages.loading && t.timeline.length <= 1 && !run.typing && isActive(run) ? <p className="mt-4 text-sm text-muted">Waiting for the first Bot to reply…</p> : null}

          <div className="pointer-events-none sticky bottom-44 z-10 flex justify-center">
            {unseen > 0 ? (
              <button type="button" className="btn btn-primary btn-sm pointer-events-auto mt-4 rounded-full shadow-md" onClick={jumpToEnd}>
                <ArrowDown size={14} aria-hidden /> {unseen === 1 ? "1 new post" : `${unseen} new posts`}
              </button>
            ) : null}
          </div>
          <div className="sticky bottom-0 z-20 mt-6">
            <Composer ref={composerRef} run={run} participants={participants} myCommunityId={t.myCommunityId} disabledReason={composerReason} />
          </div>
        </section>

        <aside
          id="panel-deal"
          aria-label="Deal and decisions"
          className={`space-y-4 pb-10 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:pb-6 lg:pr-1 scroll-thin ${tab === "deal" ? "" : "max-lg:hidden"}`}
        >
          <DecisionCard t={t} run={run} needsMe={needsMe} />
          <div id="deal-panel">
            <DealPanel run={run} deals={deals} loading={t.deals.loading} cards={t.cards} names={t.names} selectedRound={selectedRound} onSelectRound={setSelectedRound} />
          </div>
          <StatusList ids={statusIds} names={t.names} approvals={t.approvals} visible={t.approvalsVisible} myCommunityId={t.myCommunityId} />
          <RunControls run={run} deal={latestDeal} approvals={t.approvals} names={t.names} onSteer={steer} />
          {isPresenter ? <PresenterLinks approvals={t.approvals} names={t.names} /> : null}
        </aside>
      </div>
    </div>
  );
}

function DecisionCard({ t, run, needsMe }: { t: ThreadData; run: Run; needsMe: boolean }) {
  const { isPresenter } = usePresenter();
  const { switchTo } = useIdentity();
  const [actingFor, setActingFor] = useState<string | null>(null);
  const myName = t.myCommunityId ? (t.names[t.myCommunityId] ?? t.myCommunityId) : "";

  if (needsMe && t.myRequest) {
    return (
      <section className="card border-accent/50 p-5" aria-label="Your decision" data-tour="decision">
        <DecisionForm token={t.myRequest.token} round={run.round} label={`Your decision for ${myName}`} onResponded={t.reload} />
      </section>
    );
  }

  if (isPresenter && run.status === "pending_approval") {
    const pending = t.approvals.filter((a): a is ApprovalView & { token: string } => !!a.token && a.status === "pending");
    if (pending.length) {
      const target = pending.find((a) => a.communityId === actingFor) ?? pending[0];
      return (
        <section className="card admin-only border-accent/50 p-5" aria-label="Act for a community">
          <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="eyebrow">Act for</span>
            <select className="input h-8 min-h-8 w-auto flex-1 py-0 text-sm" value={target.communityId} onChange={(e) => setActingFor(e.target.value)}>
              {pending.map((a) => (
                <option key={a.communityId} value={a.communityId}>
                  {t.names[a.communityId] ?? a.name}
                </option>
              ))}
            </select>
          </label>
          <DecisionForm key={target.token} token={target.token} round={run.round} label={`Acting for ${t.names[target.communityId] ?? target.name}`} onResponded={t.reload} />
        </section>
      );
    }
  }

  if (t.myRequest && t.myRequest.status !== "pending") {
    const mine = t.approvals.find((a) => a.communityId === t.myRequest!.communityId);
    return (
      <section className="card flex items-start gap-3 p-4" aria-label="Your decision" data-tour="decision">
        <Avatar id={t.myRequest.communityId} name={myName} size={28} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Your decision</span>
            <ApprovalPill status={t.myRequest.status} />
          </p>
          {mine?.note ? <p className="mt-1 text-muted">“{mine.note}”</p> : null}
          {t.myRequest.status === "renegotiate" && run.status === "negotiating" ? <p className="mt-1 text-muted">The Bots are working on round {run.round}.</p> : null}
        </div>
      </section>
    );
  }

  if (t.myRequest && t.myRequest.status === "pending" && run.status !== "pending_approval" && isActive(run)) {
    return (
      <section className="card p-4 text-sm text-muted" aria-label="Your decision" data-tour="decision">
        The Bots are still negotiating round {run.round}. You can decide once the deal is compiled.
      </section>
    );
  }

  if (t.otherSavedIdentity) {
    return (
      <section className="card p-4 text-sm" aria-label="Switch organiser">
        <p className="text-muted">
          You have the organiser link for <span className="font-medium text-ink">{t.otherSavedIdentity.name}</span> saved.
        </p>
        <button type="button" className="btn btn-sm mt-3" onClick={() => switchTo(t.otherSavedIdentity!.inbox)}>
          Act as {t.otherSavedIdentity.name}
        </button>
      </section>
    );
  }
  return null;
}

/**
 * Follows the conversation while the reader is at the bottom. Otherwise new posts (messages,
 * not derived events) are counted for the "new posts" pill. Nothing counts until messages load.
 */
function useAutoScroll(messageCount: number | null, itemCount: number, typing: string | null) {
  const [unseen, setUnseen] = useState(0);
  const atBottom = useRef(true);
  const previousMessages = useRef<number | null>(null);
  const previousItems = useRef(itemCount);

  const measure = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;

  useEffect(() => {
    const onScroll = () => {
      atBottom.current = measure();
      if (atBottom.current) setUnseen(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));

  useEffect(() => {
    if (messageCount === null) return;
    if (previousMessages.current === null) {
      previousMessages.current = messageCount;
      atBottom.current = measure();
      return;
    }
    const added = messageCount - previousMessages.current;
    previousMessages.current = messageCount;
    if (added > 0 && !atBottom.current) setUnseen((n) => n + added);
  }, [messageCount]);

  useEffect(() => {
    const grew = itemCount > previousItems.current;
    previousItems.current = itemCount;
    if (grew && atBottom.current && previousMessages.current !== null) toEnd();
  }, [itemCount]);

  useEffect(() => {
    if (typing && atBottom.current && previousMessages.current !== null) toEnd();
  }, [typing]);

  return {
    unseen,
    jumpToEnd: () => {
      setUnseen(0);
      toEnd();
    },
  };
}
