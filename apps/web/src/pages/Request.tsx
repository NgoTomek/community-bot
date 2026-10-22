import { MatchParamsSchema, NegotiateParamsSchema, formatZodError, type Card } from "@community-bots/core";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJob, jobHeadline, listCommunities, submitJob } from "../product/api";
import { EvidenceMark } from "../product/EvidenceMark";
import { isWrongPasscode } from "../product/errors";
import { PasscodeForm } from "../product/PasscodeForm";
import { readMatch } from "../product/results";
import { AppLink, usePasscode, usePresent, useRegisterBackend } from "../product/session";
import { supabaseConfigured } from "../product/supabase";
import { useLiveQuery } from "../product/useLive";
import { isCommunityId, withPresent } from "../product/url";
import { EmptyState, ErrorBanner, Loading, SetupNotice, StatusBadge, useTitle } from "../product/ui";

const EXAMPLES = [
  "A room on a weeknight for a joint talk, about 40 people",
  "Another community to bring speakers for a demo night",
  "A co-host for a Saturday workshop",
];

export default function Request() {
  const { id } = useParams();
  const valid = isCommunityId(id);
  const navigate = useNavigate();
  const present = usePresent();
  const { passcode, clear, report } = usePasscode();
  useTitle("Collab request");
  const [need, setNeed] = useState("");
  const [submittedNeed, setSubmittedNeed] = useState<string | null>(null);
  const [matchJobId, setMatchJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const communities = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: "request-communities",
    load: listCommunities,
  });

  const job = useLiveQuery({
    enabled: supabaseConfigured && Boolean(matchJobId),
    key: `match:${matchJobId ?? "none"}`,
    load: () => getJob(matchJobId as string),
    watch: matchJobId ? [{ table: "jobs", filter: `id=eq.${matchJobId}` }] : [],
    pollMs: 2000,
  });

  const lead = communities.data?.find((community) => community.id === id) ?? null;
  const match = job.data?.status === "done" ? readMatch(job.data.result) : null;
  useRegisterBackend(match?.backend ?? null);
  const cards = useMemo(() => {
    const map: Record<string, Card | undefined> = {};
    for (const community of communities.data ?? []) {
      if (community.card) map[community.id] = community.card;
    }
    return map;
  }, [communities.data]);
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const community of communities.data ?? []) map[community.id] = community.name;
    return map;
  }, [communities.data]);
  const needMatches = submittedNeed !== null && need.trim() === submittedNeed;

  async function matchCommunities() {
    if (!passcode || !valid) return;
    const parsed = MatchParamsSchema.safeParse({ leadId: id, need });
    if (!parsed.success) {
      setFormError(formatZodError(parsed.error));
      return;
    }
    setBusy(true);
    setFormError(null);
    setSelected([]);
    try {
      const jobId = await submitJob(passcode, "match", parsed.data);
      setMatchJobId(jobId);
      setSubmittedNeed(parsed.data.need);
    } catch (error) {
      const message = report(error);
      if (!isWrongPasscode(message)) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  async function negotiate() {
    if (!passcode || !valid || !matchJobId) return;
    const runId = crypto.randomUUID();
    const parsed = NegotiateParamsSchema.safeParse({
      runId,
      leadId: id,
      need: need.trim(),
      partnerIds: selected,
      matchJobId,
    });
    if (!parsed.success) {
      setFormError(formatZodError(parsed.error));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const jobId = await submitJob(passcode, "negotiate", parsed.data);
      navigate(withPresent(`/run/${runId}?job=${jobId}`, present));
    } catch (error) {
      const message = report(error);
      if (!isWrongPasscode(message)) setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(communityId: string) {
    setSelected((current) => {
      if (current.includes(communityId)) return current.filter((item) => item !== communityId);
      if (current.length >= 3) return current;
      return [...current, communityId];
    });
  }

  return (
    <div className="page stack-lg">
      {!valid ? <EmptyState title="This address is not a community id" /> : null}
      {valid && !supabaseConfigured ? <SetupNotice /> : null}
      {valid && supabaseConfigured && communities.loading && !communities.data ? <Loading label="Loading communities" /> : null}
      <ErrorBanner message={communities.error || formError || job.error} />
      {valid && supabaseConfigured && communities.data && !lead && !communities.loading && !communities.error ? (
        <EmptyState title="This community is not on the board">
          <AppLink to="/">Directory</AppLink>
        </EmptyState>
      ) : null}
      {lead ? (
        <>
          <header className="stack">
            <p className="kicker">Collab request</p>
            <StatusBadge status={lead.status} />
            <h1>{lead.name}</h1>
            <AppLink to={`/c/${lead.id}`}>Read the card</AppLink>
          </header>
          {!passcode ? <PasscodeForm reason="The passcode is required to match or start a negotiation. It stays in this tab." /> : null}
          {passcode ? (
            <button type="button" className="btn-quiet" onClick={clear}>
              Change passcode
            </button>
          ) : null}
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void matchCommunities();
            }}
          >
            <label className="block-label">
              Need
              <textarea className="field" value={need} onChange={(event) => setNeed(event.target.value)} maxLength={600} />
            </label>
            <p className="hint">{need.trim().length} / 600 · at least 5 characters. The chips below are examples.</p>
            <div className="row">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setNeed(example)}>
                  {example}
                </button>
              ))}
            </div>
            <button className="btn-signal" type="submit" disabled={!passcode || busy}>
              Match
            </button>
          </form>
          {job.data ? (
            <p role="status">
              <span className="kicker">Job {job.data.status}</span> {jobHeadline(job.data)}
            </p>
          ) : null}
          {match && !needMatches ? <p className="note">These candidates are for a previous need. Match again before you negotiate.</p> : null}
          {match && match.dropped > 0 ? <p className="note">Some candidates could not be read.</p> : null}
          {match && match.candidates.length === 0 ? <EmptyState title="The match finished with no candidates" /> : null}
          {match && match.candidates.length > 0 ? (
            <section className="stack">
              <h2>Candidates</h2>
              <p>
                {selected.length} of 3 selected
              </p>
              {match.candidates.map((candidate, index) => {
                const checked = selected.includes(candidate.communityId);
                const name = names[candidate.communityId] || candidate.communityId;
                return (
                  <article key={candidate.communityId} className="candidate">
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selected.length >= 3}
                        onChange={() => toggle(candidate.communityId)}
                      />
                      <span className="sr-only">Select {name}</span>
                    </label>
                    <div className="stack">
                      <p className="rank">{index + 1}</p>
                      <h3>
                        <AppLink to={`/c/${candidate.communityId}`}>{name}</AppLink>
                      </h3>
                      <p className="kicker">{candidate.fit}</p>
                      {candidate.reasons.map((reason, reasonIndex) => (
                        <blockquote key={reasonIndex} className="stack">
                          <p>{reason.claim}</p>
                          <p>{reason.evidence}</p>
                          <EvidenceMark quote={reason.evidence} card={cards[reason.cardOwnerId]} />
                        </blockquote>
                      ))}
                      {candidate.concerns.length > 0 ? (
                        <div>
                          <p className="kicker">Concerns</p>
                          <ul>
                            {candidate.concerns.map((concern, concernIndex) => (
                              <li key={concernIndex}>{concern}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              <button
                type="button"
                className="btn-signal"
                disabled={!passcode || busy || !needMatches || selected.length === 0 || selected.length > 3}
                onClick={() => void negotiate()}
              >
                Start negotiation
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
