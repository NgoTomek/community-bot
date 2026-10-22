import { LIMITS, type Card, type Fit, type MatchCandidate } from "@community-bots/core";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePresenter } from "../../app/presenter";
import { Avatar } from "../../components/Avatar";
import { DraftBadge, FitBadge, SampleBadge } from "../../components/Badges";
import { EvidenceChip } from "../../components/EvidenceChip";
import { ErrorState } from "../../components/ui/States";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText, useCommunities, useJob } from "../../data/hooks";
import type { Community } from "../../data/types";
import type { StorageLike } from "../../lib/identity";
import { plural, relativeTime, truncate } from "../../lib/format";
import { useNewRequest } from "../request/NewRequest";
import { stripGuess } from "./cardForm";
import { JobSteps } from "./JobSteps";
import { diffMatches, summarizeMatchDiff, type RankChange } from "./matchDiff";
import { EMPTY_HISTORY, loadMatchHistory, pushMatchSnapshot, readCandidates, saveMatchHistory, type MatchHistory, type MatchSnapshot } from "./matchHistory";
import { MATCH_STEPS } from "./progress";

function tabStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const FIT_WORD: Record<Fit, string> = { strong: "strong", good: "good", weak: "weak" };

function ChangeBadges({ change, fitBefore }: { change: RankChange | null; fitBefore: Fit | null }) {
  return (
    <>
      {change?.kind === "new" ? <span className="pill bg-accent-soft text-accent">New</span> : null}
      {change?.kind === "up" || change?.kind === "down" ? (
        <span
          className={`pill tabular ${change.kind === "up" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
          title={`Moved ${change.kind} ${plural(change.places, "place")}`}
        >
          {change.kind === "up" ? <ArrowUp size={12} strokeWidth={2.5} aria-hidden /> : <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
          {change.places}
          <span className="sr-only">
            {" "}
            {change.places === 1 ? "place" : "places"} {change.kind}
          </span>
        </span>
      ) : null}
      {fitBefore ? <span className="pill bg-warn-soft text-warn">Was a {FIT_WORD[fitBefore]} fit</span> : null}
    </>
  );
}

function CandidateCard({
  candidate,
  rank,
  community,
  cards,
  names,
  badges,
  tone = "normal",
}: {
  candidate: MatchCandidate;
  rank: number;
  community: Community | undefined;
  cards: Record<string, Card>;
  names: Record<string, string>;
  badges?: ReactNode;
  tone?: "normal" | "new" | "dropped";
}) {
  const name = community?.name ?? candidate.communityId;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: tone === "dropped" ? 0.65 : 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`card p-4 ${tone === "new" ? "ring-2 ring-accent/30" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-5 shrink-0 pt-2 text-right text-sm tabular text-faint">{rank}</span>
        <Avatar id={candidate.communityId} name={name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/c/${candidate.communityId}`} className="font-medium hover:underline">
              {name}
            </Link>
            <FitBadge fit={candidate.fit} />
            {community?.status === "draft" ? <DraftBadge /> : null}
            {badges}
          </div>
          {candidate.reasons.length ? (
            <ul className="mt-3 space-y-2">
              {candidate.reasons.map((reason, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span>{reason.claim}</span>
                  <EvidenceChip quote={reason.evidence} preferredId={reason.cardOwnerId} cards={cards} names={names} />
                </li>
              ))}
            </ul>
          ) : null}
          {candidate.concerns.length ? (
            <ul className="mt-3 space-y-1">
              {candidate.concerns.map((concern, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-warn">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{concern}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}

function ColumnHeader({ label, snapshot }: { label: string; snapshot: MatchSnapshot }) {
  return (
    <header className="mb-3">
      <h3 className="eyebrow">{label}</h3>
      <p className="mt-1.5 leading-relaxed">“{snapshot.need}”</p>
      <p className="mt-0.5 text-xs text-faint">
        {relativeTime(snapshot.at)} · {plural(snapshot.candidates.length, "match", "matches")}
      </p>
    </header>
  );
}

function MatchResults({
  latest,
  previous,
  byId,
  cards,
  names,
  mock,
  onClear,
  onUseNeed,
}: {
  latest: MatchSnapshot;
  previous: MatchSnapshot | null;
  byId: Record<string, Community>;
  cards: Record<string, Card>;
  names: Record<string, string>;
  mock: boolean;
  onClear: () => void;
  onUseNeed: (need: string) => void;
}) {
  const diff = useMemo(() => diffMatches(previous?.candidates ?? null, latest.candidates), [previous, latest]);
  const summary = summarizeMatchDiff(diff);
  const empty = <p className="card px-4 py-6 text-center text-sm text-muted">No community matched this need.</p>;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-semibold">{previous ? "Compared with the previous run" : "Matches"}</h3>
        <p className="text-sm text-muted" aria-live="polite">
          {summary}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {mock || latest.backend === "mock" ? <SampleBadge compact /> : null}
          <button type="button" className="btn btn-sm" onClick={() => onUseNeed(latest.need)}>
            Start a collab request with this need
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
            Clear results
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-6">
        <section className="min-w-0" aria-label="This run">
          <ColumnHeader label={previous ? "This run" : "Latest run"} snapshot={latest} />
          {diff.current.length === 0 ? (
            empty
          ) : (
            <ol className="space-y-3">
              <AnimatePresence initial={false}>
                {diff.current.map((row) => (
                  <CandidateCard
                    key={`${latest.jobId}:${row.candidate.communityId}`}
                    candidate={row.candidate}
                    rank={row.rank}
                    community={byId[row.candidate.communityId]}
                    cards={cards}
                    names={names}
                    tone={row.change?.kind === "new" ? "new" : "normal"}
                    badges={<ChangeBadges change={row.change} fitBefore={row.fitBefore} />}
                  />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </section>

        {previous ? (
          <section className="min-w-0" aria-label="Previous run">
            <ColumnHeader label="Previous run" snapshot={previous} />
            {diff.previous.length === 0 ? (
              empty
            ) : (
              <ol className="space-y-3">
                {diff.previous.map((row) => (
                  <CandidateCard
                    key={`${previous.jobId}:${row.candidate.communityId}`}
                    candidate={row.candidate}
                    rank={row.rank}
                    community={byId[row.candidate.communityId]}
                    cards={cards}
                    names={names}
                    tone={row.dropped ? "dropped" : "normal"}
                    badges={row.dropped ? <span className="pill bg-bad-soft text-bad">Dropped</span> : null}
                  />
                ))}
              </ol>
            )}
          </section>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-muted max-lg:hidden">
            <p className="max-w-xs">Run the Matchmaker again, with the same need or a new one, to compare the two rankings side by side.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Meet your Bot": run the Matchmaker for this community and compare with the previous run. */
export function TryIt({ community }: { community: Community }) {
  const source = useData();
  const { ensurePasscode } = usePresenter();
  const { open } = useNewRequest();
  const communities = useCommunities();
  const gate = useGate("submit_job");
  const needs = community.card.needs.map(stripGuess);
  const [need, setNeed] = useState<string | null>(null);
  const value = need ?? needs[0] ?? "";
  const [submitted, setSubmitted] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MatchHistory>(() => loadMatchHistory(tabStorage(), community.id));
  const job = useJob(jobId);
  const running = !!jobId && (!job.data || job.data.status === "queued" || job.data.status === "running");
  const failed = job.data?.status === "error";
  const list = useMemo(() => communities.data ?? [], [communities.data]);
  const byId = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c])), [list]);
  const cards = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c.card])), [list]);
  const names = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c.name])), [list]);

  useEffect(() => {
    if (!jobId || job.data?.status !== "done") return;
    const result = (job.data.result ?? {}) as { need?: unknown; backend?: unknown; candidates?: unknown };
    const next = pushMatchSnapshot(history, {
      jobId,
      need: typeof result.need === "string" && result.need.trim() ? result.need : submitted,
      at: new Date().toISOString(),
      backend: typeof result.backend === "string" ? result.backend : null,
      candidates: readCandidates(result.candidates),
    });
    setHistory(next);
    saveMatchHistory(tabStorage(), community.id, next);
    setJobId(null);
  }, [jobId, job.data, history, submitted, community.id]);

  const run = async () => {
    const text = value.trim();
    if (text.length < 5) return;
    setError(null);
    const passcode = await ensurePasscode("Running the Matchmaker needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      const id = await source.submitJob(passcode, "match", { leadId: community.id, need: text });
      setSubmitted(text);
      setStartedAt(Date.now());
      setJobId(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setHistory(EMPTY_HISTORY);
    saveMatchHistory(tabStorage(), community.id, EMPTY_HISTORY);
  };

  const tooShort = value.trim().length < 5;
  return (
    <section className="mt-16" aria-labelledby="try-it-title">
      <p className="eyebrow">Try it</p>
      <h2 id="try-it-title" className="mt-1 font-display text-2xl sm:text-3xl">
        Meet {community.name}'s Bot
      </h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted">
        Describe something {community.name} needs. The Matchmaker ranks partner communities using only what is on their cards, and every reason links to the quote it relies
        on. Nothing is sent to anyone.
      </p>

      <div className="card mt-6 p-4 sm:p-6">
        <label htmlFor="try-need" className="text-sm font-medium">
          What does {community.name} need?
        </label>
        <textarea
          id="try-need"
          className="input mt-2 min-h-24!"
          value={value}
          maxLength={LIMITS.need}
          onChange={(e) => setNeed(e.target.value)}
          placeholder="A workshop for 40 people next month. We need a space and two mentors."
          disabled={running}
          aria-describedby="try-need-hint"
        />
        {needs.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">From the card:</span>
            {needs.map((n, i) => (
              <button key={`${n}:${i}`} type="button" className="chip-btn text-left" aria-pressed={value === n} onClick={() => setNeed(n)} disabled={running} title={n}>
                {truncate(n, 48)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tooltip label={gate.reason} focusable={gate.disabled}>
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={tooShort || busy || running || gate.disabled}>
              {busy || running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
              Run the Matchmaker
            </button>
          </Tooltip>
          <p id="try-need-hint" className="text-sm text-muted">
            {tooShort ? "Write at least a few words." : history.latest ? "The new ranking appears next to this one." : "Takes a few seconds."}
          </p>
        </div>

        {running ? (
          <div className="mt-6 border-t border-line pt-5">
            <JobSteps defs={MATCH_STEPS} job={job.data} label="Matchmaker progress" startedAt={startedAt} />
          </div>
        ) : null}
        {failed ? (
          <div className="mt-6">
            <ErrorState title="The Matchmaker could not finish" message={job.data?.error ?? "Something went wrong."} onRetry={() => void run()} />
          </div>
        ) : null}
        {error ? (
          <div className="mt-6">
            <ErrorState title="The Matchmaker did not start" message={error} />
          </div>
        ) : null}
      </div>

      {history.latest ? (
        <MatchResults
          latest={history.latest}
          previous={history.previous}
          byId={byId}
          cards={cards}
          names={names}
          mock={source.kind === "mock"}
          onClear={clear}
          onUseNeed={(text) => open({ leadId: community.id, need: text })}
        />
      ) : null}
    </section>
  );
}
