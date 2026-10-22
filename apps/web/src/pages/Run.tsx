import { DealSchema, formatZodError } from "@community-bots/core";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getCommunities, getJob, getRun, jobHeadline, listDeals, listMessages, presenterStatus, type PresenterStatus } from "../product/api";
import { Transcript } from "../product/Chat";
import { DealCard } from "../product/DealCard";
import { isWrongPasscode } from "../product/errors";
import { PasscodeForm } from "../product/PasscodeForm";
import { PhaseTracker } from "../product/PhaseTracker";
import { PhoneLinks } from "../product/PhoneLinks";
import { readBackend } from "../product/results";
import { AppLink, usePasscode, useRegisterBackend } from "../product/session";
import { supabaseConfigured } from "../product/supabase";
import { useLiveQuery } from "../product/useLive";
import { isUuid } from "../product/url";
import { ApprovalChip, EmptyState, ErrorBanner, Loading, SetupNotice, useTitle } from "../product/ui";

export default function Run() {
  const { runId } = useParams();
  const [params] = useSearchParams();
  const jobId = params.get("job");
  const valid = isUuid(runId);
  const validJob = isUuid(jobId ?? undefined);
  useTitle("Negotiation");
  const { passcode, report } = usePasscode();
  const [rows, setRows] = useState<PresenterStatus[]>([]);
  const [presenterError, setPresenterError] = useState<string | null>(null);

  const runQuery = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: `run:${runId ?? "none"}`,
    load: () => getRun(runId as string),
    watch: valid ? [{ table: "runs", filter: `id=eq.${runId}` }] : [],
    pollMs: 2000,
  });
  const messages = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: `messages:${runId ?? "none"}`,
    load: () => listMessages(runId as string),
    watch: valid ? [{ table: "messages", filter: `run_id=eq.${runId}` }] : [],
    pollMs: 2000,
  });
  const deals = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: `deals:${runId ?? "none"}`,
    load: () => listDeals(runId as string),
    watch: valid ? [{ table: "deals", filter: `run_id=eq.${runId}` }] : [],
    pollMs: 2000,
  });
  const job = useLiveQuery({
    enabled: supabaseConfigured && validJob,
    key: `run-job:${jobId ?? "none"}`,
    load: () => getJob(jobId as string),
    watch: validJob ? [{ table: "jobs", filter: `id=eq.${jobId}` }] : [],
    pollMs: 2000,
  });

  const run = runQuery.data ?? null;
  const runMissing = runQuery.data === null;
  const backend = run?.backend ?? (job.data?.status === "done" ? readBackend(job.data.result) : null);
  useRegisterBackend(backend);

  const ids = run ? [run.leadId, ...run.partnerIds] : [];
  const idKey = ids.join(",");
  const communities = useLiveQuery({
    enabled: supabaseConfigured && ids.length > 0,
    key: `run-cards:${idKey}`,
    load: () => getCommunities(ids),
  });

  useEffect(() => {
    if (!passcode || !valid) return;
    let cancel = false;
    let timer = 0;
    const tick = async () => {
      try {
        const next = await presenterStatus(passcode, runId);
        if (cancel) return;
        setRows(next);
        setPresenterError(null);
      } catch (error) {
        if (cancel) return;
        const message = report(error);
        if (isWrongPasscode(message)) return;
        if (/unknown run/i.test(message) && runMissing) setPresenterError(null);
        else setPresenterError(message);
      }
      if (!cancel) timer = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [passcode, valid, runId, report, runMissing]);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const community of communities.data ?? []) map[community.id] = community.name;
    for (const row of rows) map[row.communityId] = row.name;
    return map;
  }, [communities.data, rows]);
  const cards = useMemo(() => {
    const map: Record<string, import("@community-bots/core").Card | undefined> = {};
    for (const community of communities.data ?? []) {
      if (community.card) map[community.id] = community.card;
    }
    return map;
  }, [communities.data]);

  const dealRow = run?.dealId
    ? (deals.data ?? []).find((deal) => deal.id === run.dealId) ?? (deals.data ?? []).at(-1) ?? null
    : (deals.data ?? []).at(-1) ?? null;
  const parsedDeal = dealRow ? DealSchema.safeParse(dealRow.deal) : null;

  return (
    <div className="page stack-lg">
      {!valid ? <EmptyState title="This address is not a run id" /> : null}
      {valid && !supabaseConfigured ? <SetupNotice /> : null}
      {valid && supabaseConfigured ? (
        <>
          <header className="stack">
            <p className="kicker">Negotiation</p>
            <h1>{run?.need ? "Live run" : "Run"}</h1>
            <PhaseTracker status={run?.status ?? null} />
            {run?.status ? <p className="muted">Run status: {run.status}</p> : null}
          </header>
          {runQuery.loading && runQuery.data === undefined ? <Loading label="Loading the run" /> : null}
          <ErrorBanner message={runQuery.error || messages.error || deals.error || job.error} />
          {job.data ? (
            <p role="status">
              <span className="kicker">Job {job.data.status}</span> {jobHeadline(job.data)}
            </p>
          ) : null}
          {runQuery.data === null && !runQuery.loading && !runQuery.error ? (
            <EmptyState title="Waiting for this run">
              <p>The worker has not opened it yet.</p>
            </EmptyState>
          ) : null}
          {run ? (
            <>
              {run.error ? <ErrorBanner message={run.error} /> : null}
              {run.status === "declined" ? <p className="bad">Declined{run.declineReason ? `: ${run.declineReason}` : ""}</p> : null}
              {run.need ? (
                <blockquote>
                  <p>{run.need}</p>
                </blockquote>
              ) : null}
              <Transcript messages={messages.data ?? []} cards={cards} names={names} typingId={run.typing} />
              {parsedDeal && !parsedDeal.success ? <ErrorBanner message={formatZodError(parsedDeal.error)} /> : null}
              {parsedDeal?.success ? <DealCard deal={parsedDeal.data} cards={cards} /> : null}
              {dealRow ? (
                <AppLink className="btn-quiet" to={`/event/${dealRow.id}`}>
                  Open the event page
                </AppLink>
              ) : null}
            </>
          ) : null}
          <section className="stack">
            <h2>Responses</h2>
            {!passcode ? <PasscodeForm reason="The passcode loads each community's phone link. It stays in this tab." /> : null}
            <ErrorBanner message={presenterError} />
            {passcode && rows.length === 0 && !presenterError ? <p className="muted">No responses yet. Approval links appear when a deal is out.</p> : null}
            {rows.map((row) => (
              <article key={row.communityId} className="clipping stack">
                <h3>{row.name}</h3>
                <ApprovalChip status={row.status} />
                {row.round !== null ? <p>Round {row.round}</p> : null}
                <p>{row.note?.trim() ? row.note : "No note"}</p>
                <PhoneLinks token={row.token} inboxToken={row.inboxToken} />
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
