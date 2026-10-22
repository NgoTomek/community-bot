import type { MatchCandidate } from "@community-bots/core";
import { ArrowLeft, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useIdentity } from "../../app/identity";
import { usePresenter } from "../../app/presenter";
import { Avatar } from "../../components/Avatar";
import { DraftBadge, FitBadge } from "../../components/Badges";
import { EvidenceChip } from "../../components/EvidenceChip";
import { Sheet } from "../../components/ui/Dialog";
import { ErrorState, SkeletonCard } from "../../components/ui/States";
import { Tooltip, useGate } from "../../components/ui/Tooltip";
import { useData } from "../../data/DataProvider";
import { errorText, useCommunities, useJob } from "../../data/hooks";
import type { Community, MatchJobResult } from "../../data/types";

export const NEED_EXAMPLES = [
  "A beginner workshop for 40 people next month. We need a space and two mentors.",
  "A demo night for 60 people. We need a bigger venue and a couple of speakers.",
  "A Saturday hack day for 50 people. We need sponsorship for food and prizes.",
];

interface Prefill {
  leadId?: string;
  need?: string;
}

const NewRequestContext = createContext<{ open: (prefill?: Prefill) => void } | null>(null);

export function NewRequestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill: Prefill; key: number }>({ open: false, prefill: {}, key: 0 });
  const open = useCallback((prefill: Prefill = {}) => setState((s) => ({ open: true, prefill, key: s.key + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <NewRequestContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onClose={close} title="New collab request">
        <NewRequestFlow key={state.key} prefill={state.prefill} onDone={close} />
      </Sheet>
    </NewRequestContext.Provider>
  );
}

export function useNewRequest() {
  const ctx = useContext(NewRequestContext);
  if (!ctx) throw new Error("useNewRequest must be used inside NewRequestProvider");
  return ctx;
}

const MAX_PARTNERS = 3;

function preselect(candidates: MatchCandidate[]): string[] {
  const strong = candidates.filter((c) => c.fit === "strong").slice(0, MAX_PARTNERS).map((c) => c.communityId);
  return strong.length ? strong : candidates.slice(0, 1).map((c) => c.communityId);
}

function NewRequestFlow({ prefill, onDone }: { prefill: Prefill; onDone: () => void }) {
  const source = useData();
  const navigate = useNavigate();
  const { active } = useIdentity();
  const { ensurePasscode } = usePresenter();
  const communities = useCommunities();
  const submitGate = useGate("submit_job");

  const list = useMemo(() => {
    const all = communities.data ?? [];
    return [...all].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "confirmed" ? -1 : 1));
  }, [communities.data]);
  const byId = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c])), [list]);

  const [leadId, setLeadId] = useState<string>(prefill.leadId ?? active?.communityId ?? "");
  const [need, setNeed] = useState(prefill.need ?? "");
  const [matchJobId, setMatchJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(matchJobId);

  useEffect(() => {
    if (!leadId && list.length) setLeadId(active?.communityId && byId[active.communityId] ? active.communityId : list[0].id);
  }, [leadId, list, byId, active]);

  const result = job.data?.status === "done" ? (job.data.result as MatchJobResult) : null;
  const candidates = useMemo(() => (result?.candidates ?? []).filter((c) => byId[c.communityId]), [result, byId]);
  useEffect(() => {
    if (result && selected === null) setSelected(preselect(candidates));
  }, [result, candidates, selected]);

  const cards = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c.card])), [list]);
  const names = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c.name])), [list]);
  const needOk = need.trim().length >= 5;
  const matching = !!matchJobId && (!job.data || job.data.status === "queued" || job.data.status === "running");

  const findMatches = async () => {
    setError(null);
    const passcode = await ensurePasscode("Finding matches runs the Matchmaker Bot, which needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      setSelected(null);
      setMatchJobId(await source.submitJob(passcode, "match", { leadId, need: need.trim() }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!selected?.length) return;
    setError(null);
    const passcode = await ensurePasscode("Starting a negotiation needs the organiser passcode.");
    if (passcode === false) return;
    setBusy(true);
    try {
      const runId = crypto.randomUUID();
      const jobId = await source.submitJob(passcode, "negotiate", {
        runId,
        leadId,
        need: need.trim(),
        partnerIds: selected,
        ...(matchJobId ? { matchJobId } : {}),
      });
      onDone();
      navigate(`/run/${runId}`, { state: { jobId } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const current = prev ?? [];
      if (current.includes(id)) return current.filter((x) => x !== id);
      return current.length >= MAX_PARTNERS ? current : [...current, id];
    });

  if (communities.loading) return <SkeletonCard lines={4} />;
  if (communities.error && !list.length) return <ErrorState message={communities.error} onRetry={communities.reload} />;

  const showResults = !!result;
  return (
    <div className="space-y-6">
      {!showResults ? (
        <>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Which community is asking?</span>
            <select className="input" value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={matching}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "draft" ? " (draft card)" : ""}
                  {active?.communityId === c.id ? " · you" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <label htmlFor="need" className="text-sm font-medium">
              What do you need?
            </label>
            <textarea
              id="need"
              className="input min-h-[112px]"
              value={need}
              maxLength={600}
              onChange={(e) => setNeed(e.target.value)}
              placeholder="A workshop for 40 people next month. We need a space and two mentors."
              disabled={matching}
            />
            <div className="flex flex-wrap gap-2">
              {NEED_EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip-btn text-left" onClick={() => setNeed(example)} disabled={matching}>
                  {example.split(".")[0]}
                </button>
              ))}
            </div>
          </div>

          {matching ? (
            <div className="card flex items-center gap-3 p-4" role="status" aria-live="polite">
              <Loader2 size={18} className="animate-spin text-accent" aria-hidden />
              <div>
                <p className="font-medium">Matchmaker Bot is working</p>
                <p className="text-sm text-muted">{job.data?.progress ? capitalise(job.data.progress) : "Queued"}…</p>
              </div>
            </div>
          ) : null}
          {job.data?.status === "error" ? <ErrorState title="Matching failed" message={job.data.error ?? "The Matchmaker could not finish."} onRetry={findMatches} /> : null}
          {error ? <ErrorState message={error} /> : null}

          <Tooltip label={submitGate.reason} focusable={submitGate.disabled}>
            <button type="button" className="btn btn-primary btn-lg w-full sm:w-auto" onClick={findMatches} disabled={!needOk || !leadId || busy || matching || submitGate.disabled}>
              <Sparkles size={16} aria-hidden />
              Find matches
            </button>
          </Tooltip>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm -ml-2 mt-0.5"
              onClick={() => {
                setMatchJobId(null);
                setSelected(null);
              }}
              aria-label="Back to the need"
            >
              <ArrowLeft size={18} aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="eyebrow">For {byId[leadId]?.name ?? leadId}</p>
              <p className="mt-1 leading-snug">{need}</p>
            </div>
          </div>

          {candidates.length === 0 ? (
            <p className="text-muted">No community matched. Try describing the need differently, or add more communities.</p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="mb-3 flex w-full items-baseline justify-between gap-2">
                <span className="font-medium">Ranked matches</span>
                <span className="text-sm text-muted">
                  {selected?.length ?? 0} of {MAX_PARTNERS} picked
                </span>
              </legend>
              {candidates.map((c, i) => (
                <CandidateRow
                  key={c.communityId}
                  rank={i + 1}
                  candidate={c}
                  community={byId[c.communityId]}
                  checked={!!selected?.includes(c.communityId)}
                  disabled={!selected?.includes(c.communityId) && (selected?.length ?? 0) >= MAX_PARTNERS}
                  onToggle={() => toggle(c.communityId)}
                  cards={cards}
                  names={names}
                />
              ))}
            </fieldset>
          )}

          {error ? <ErrorState message={error} /> : null}
          <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-line bg-surface px-6 py-4">
            <Tooltip label={submitGate.reason} focusable={submitGate.disabled}>
              <button type="button" className="btn btn-primary btn-lg w-full" onClick={start} disabled={!selected?.length || busy || submitGate.disabled}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                Start negotiation{selected?.length ? ` with ${selected.length} ${selected.length === 1 ? "community" : "communities"}` : ""}
              </button>
            </Tooltip>
            <p className="mt-2 text-center text-xs text-muted">Nothing is agreed until every organiser approves.</p>
          </div>
        </>
      )}
    </div>
  );
}

function CandidateRow({
  rank,
  candidate,
  community,
  checked,
  disabled,
  onToggle,
  cards,
  names,
}: {
  rank: number;
  candidate: MatchCandidate;
  community: Community;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  cards: Record<string, Community["card"]>;
  names: Record<string, string>;
}) {
  const id = `pick-${candidate.communityId}`;
  return (
    <div className={`card p-4 transition-colors ${checked ? "border-accent bg-accent-soft/40" : ""}`}>
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" className="mt-2 size-4 accent-[var(--accent-bg)]" checked={checked} disabled={disabled} onChange={onToggle} />
        <Avatar id={community.id} name={community.name} size={36} />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={`flex flex-wrap items-center gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
            <span className="text-sm tabular text-faint">{rank}.</span>
            <span className="font-medium">{community.name}</span>
            <FitBadge fit={candidate.fit} />
            {community.status === "draft" ? <DraftBadge /> : null}
          </label>
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
    </div>
  );
}

function capitalise(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
