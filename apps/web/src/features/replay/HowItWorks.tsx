import type { Card } from "@community-bots/core";
import {
  CalendarCheck2,
  CheckCheck,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Globe,
  ListOrdered,
  MessagesSquare,
  RefreshCw,
  ScanSearch,
  Server,
  ShieldCheck,
  UserCheck,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../app/title";
import { BackendBadge, BotTag, RunStatusPill, SampleBadge } from "../../components/Badges";
import { CopyButton } from "../../components/CopyButton";
import { REPO_URL } from "../../components/Footer";
import { EmptyState, ErrorState, Skeleton } from "../../components/ui/States";
import { useData } from "../../data/DataProvider";
import { useCommunities, useLive, useNow, useRuns } from "../../data/hooks";
import type { Message, Run } from "../../data/types";
import { countVerified } from "../../lib/evidence";
import { plural, relativeTime, truncate } from "../../lib/format";
import { appUrl } from "../../lib/share";

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

type Actor = "bot" | "human" | "public";

interface Step {
  title: string;
  body: string;
  actor: Actor;
  icon: LucideIcon;
  note?: string;
}

const PIPELINE: Step[] = [
  { title: "Scout drafts a card", body: "The Scout Bot reads a community's public pages and drafts its card.", actor: "bot", icon: ScanSearch },
  { title: "Organiser confirms", body: "An organiser checks the card, fixes it and confirms it. Until then it is marked as a draft.", actor: "human", icon: UserCheck },
  { title: "Matchmaker ranks partners", body: "The Matchmaker ranks partner communities, quoting their cards for every reason.", actor: "bot", icon: ListOrdered },
  {
    title: "Bots negotiate",
    body: "Each community's Bot negotiates in a shared thread anyone can watch.",
    actor: "bot",
    icon: MessagesSquare,
    note: "Humans can steer or take over",
  },
  { title: "Scribe compiles the deal", body: "The Scribe writes up what was agreed.", actor: "bot", icon: FileCheck2, note: "Code checks the date and capacity" },
  { title: "Organisers decide", body: "Every organiser approves, asks to renegotiate or declines.", actor: "human", icon: CheckCheck, note: "Nothing commits without them" },
  { title: "Event page goes live", body: "A public page with RSVP, an .ics calendar file and announcements.", actor: "public", icon: CalendarCheck2 },
];

const ACTOR_STYLE: Record<Actor, string> = {
  bot: "border-accent/30 bg-accent-soft text-accent",
  human: "border-line-strong bg-human text-ink",
  public: "border-ok/30 bg-ok-soft text-ok",
};

function HumanPill() {
  return (
    <span className="pill h-5 gap-1 border-line-strong bg-human px-1.5 text-[11px] text-ink" title="A person does this step">
      <UserRound size={12} aria-hidden />
      Human
    </span>
  );
}

function PublicPill() {
  return (
    <span className="pill h-5 gap-1 border-line bg-surface-2 px-1.5 text-[11px] text-muted" title="Anyone with the link">
      <Globe size={12} aria-hidden />
      Public
    </span>
  );
}

function ActorTag({ actor }: { actor: Actor }) {
  if (actor === "bot") return <BotTag />;
  if (actor === "human") return <HumanPill />;
  return <PublicPill />;
}

function Pipeline() {
  return (
    <section aria-labelledby="pipeline-title" className="mt-14 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Workflow size={14} aria-hidden />
            The pipeline
          </p>
          <h2 id="pipeline-title" className="mt-2 font-display text-2xl sm:text-3xl">
            From a public page to a public event
          </h2>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <BotTag /> a Bot does it
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HumanPill /> a person decides
          </span>
        </p>
      </div>
      <ol className="mt-8 grid gap-6 lg:grid-cols-7 lg:gap-4">
        {PIPELINE.map((step, i) => {
          const Icon = step.icon;
          const last = i === PIPELINE.length - 1;
          return (
            <li key={step.title} className="relative flex gap-4 lg:flex-col lg:gap-3">
              {!last ? (
                <span
                  aria-hidden
                  className="absolute left-5 top-12 -bottom-4 w-px bg-line-strong lg:left-12 lg:-right-2 lg:top-5 lg:bottom-auto lg:h-px lg:w-auto"
                />
              ) : null}
              <span
                className={`relative grid size-10 shrink-0 place-items-center rounded-full border font-display text-lg tabular ${ACTOR_STYLE[step.actor]}`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 pb-1">
                <h3 className="flex items-start gap-2 font-medium leading-snug">
                  <Icon size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <span>
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </span>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <ActorTag actor={step.actor} />
                  {step.note ? <span className="text-xs text-faint">{step.note}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Backend per run
// ---------------------------------------------------------------------------

const MAX_ROWS = 25;

const newestFirst = (runs: Run[]) => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function RunsByBackend() {
  const runs = useRuns();
  const now = useNow();
  const list = useMemo(() => newestFirst(runs.data ?? []), [runs.data]);
  const shown = list.slice(0, MAX_ROWS);

  return (
    <section aria-labelledby="backends-title" className="card p-5 sm:p-6">
      <h2 id="backends-title" className="flex items-center gap-2 font-display text-2xl">
        <Server size={20} className="text-muted" aria-hidden />
        Backend per run
      </h2>
      <p className="mt-1 text-sm text-muted">Every run records which brain its Bots used. Runs on the mock backend are sample data, not a real Bot run.</p>

      {runs.loading ? (
        <div className="mt-5 space-y-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : runs.error && !runs.data ? (
        <div className="mt-5">
          <ErrorState title="Could not load runs" message={runs.error} onRetry={runs.reload} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState compact title="No runs yet" body="When an organiser starts a collab request, its run shows up here with the backend it used." />
      ) : (
        <>
          <div className="mt-5 hidden grid-cols-[minmax(0,1fr)_6rem_8.5rem_5rem] gap-3 border-b border-line pb-2 text-xs font-medium text-muted sm:grid" aria-hidden>
            <span>Need</span>
            <span>Backend</span>
            <span>Status</span>
            <span className="text-right">Started</span>
          </div>
          <ul className="divide-y divide-line max-sm:mt-3" aria-label="Runs">
            {shown.map((run) => (
              <li key={run.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_8.5rem_5rem] sm:items-center sm:gap-3">
                <Link to={`/run/${run.id}`} className="min-w-0 font-medium leading-snug hover:text-accent hover:underline" title={run.need}>
                  {truncate(run.need, 90)}
                </Link>
                <div className="flex flex-wrap items-center gap-2 sm:contents">
                  <span>
                    <BackendBadge backend={run.backend} />
                  </span>
                  <span>
                    <RunStatusPill run={run} />
                  </span>
                  <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString()} className="text-xs tabular text-faint sm:text-right">
                    {relativeTime(run.createdAt, now)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
          {list.length > shown.length ? <p className="mt-3 text-xs text-faint">Showing the {MAX_ROWS} most recent of {list.length} runs.</p> : null}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Verified evidence
// ---------------------------------------------------------------------------

const EVIDENCE_RUNS = 20;

/** Every Bot quote of a run, checked against the cards of the communities in that run. */
function tally(runs: Run[], messagesByRun: Record<string, Message[]>, cardsById: Record<string, Card>) {
  let verified = 0;
  let total = 0;
  for (const run of runs) {
    const cards: Record<string, Card | undefined> = {};
    for (const id of [run.leadId, ...run.partnerIds]) cards[id] = cardsById[id];
    const quotes = (messagesByRun[run.id] ?? []).filter((m) => m.role === "bot").map((m) => ({ quote: m.evidence?.quote, ownerId: m.communityId }));
    const result = countVerified(quotes, cards);
    verified += result.verified;
    total += result.total;
  }
  return { verified, total };
}

function EvidenceCheck() {
  const source = useData();
  const runs = useRuns();
  const communities = useCommunities();
  const now = useNow(15_000);
  const recent = useMemo(() => newestFirst(runs.data ?? []).slice(0, EVIDENCE_RUNS), [runs.data]);
  const ids = recent.map((r) => r.id).join(",");
  const messages = useLive(
    runs.data ? `evidence:${ids}` : null,
    async () => {
      const lists = await Promise.all(recent.map(async (run) => [run.id, await source.listMessages(run.id)] as const));
      return { byRun: Object.fromEntries(lists) as Record<string, Message[]>, checkedAt: new Date().toISOString() };
    },
    { topics: [], poll: "never" },
  );

  const result = useMemo(() => {
    if (!messages.data || !communities.data) return null;
    const cardsById = Object.fromEntries(communities.data.map((c) => [c.id, c.card]));
    return tally(recent, messages.data.byRun, cardsById);
  }, [messages.data, communities.data, recent]);

  const loading = runs.loading || communities.loading || messages.loading;
  const error = (!runs.data && runs.error) || (!communities.data && communities.error) || (!messages.data && messages.error) || null;
  const retry = () => {
    if (!runs.data) runs.reload();
    if (!communities.data) communities.reload();
    messages.reload();
  };
  const percent = result && result.total ? Math.round((result.verified / result.total) * 100) : 0;

  return (
    <section aria-labelledby="evidence-title" className="card p-5 sm:p-6">
      <h2 id="evidence-title" className="flex items-center gap-2 font-display text-2xl">
        <ShieldCheck size={20} className="text-muted" aria-hidden />
        Verified evidence
      </h2>
      <p className="mt-1 text-sm text-muted">
        Every Bot claim carries a quote from a community card. Your browser looks for each quote on the cards again; flags stored by the backend are ignored.
      </p>

      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {error ? (
          <ErrorState title="Could not check the evidence" message={error} onRetry={retry} />
        ) : loading || !result || !messages.data ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState compact title="Nothing to check yet" body="Bot quotes show up here once a run has started." />
        ) : result.total === 0 ? (
          <p className="text-sm text-muted">No Bot quotes to check yet in the {plural(recent.length, "most recent run")}.</p>
        ) : (
          <div>
            <p className="font-display text-4xl tabular leading-none">
              {result.verified}
              <span className="text-2xl text-faint"> / {result.total}</span>
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-bad-soft"
              role="img"
              aria-label={`${result.verified} of ${result.total} quotes found (${percent}%)`}
            >
              <div className="h-full rounded-full bg-ok" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-3 text-sm">
              {result.verified} of {plural(result.total, "Bot quote")} {result.total === 1 ? "was" : "were"} found on the cards, checked in your browser{" "}
              {relativeTime(messages.data.checkedAt, now)}.
            </p>
            <p className="mt-1 text-xs text-faint">
              From the {plural(recent.length, "most recent run")}. Quotes that are not found get a red chip in the thread.
            </p>
            <button type="button" className="btn btn-sm mt-4" onClick={messages.reload}>
              <RefreshCw size={14} aria-hidden />
              Check again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Run it yourself
// ---------------------------------------------------------------------------

function CodeBlock({ code, labelledBy }: { code: string; labelledBy: string }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-sunken py-1.5 pl-3 pr-1.5">
      <pre className="scroll-thin min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} className="btn btn-ghost btn-sm shrink-0" />
    </div>
  );
}

function SetupStep({ n, title, children, code }: { n: number; title: string; children?: ReactNode; code?: string }) {
  const id = useId();
  return (
    <li className="flex gap-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-sm font-semibold tabular" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 id={id} className="font-medium">
          {title}
        </h3>
        {children ? <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div> : null}
        {code ? <CodeBlock code={code} labelledBy={id} /> : null}
      </div>
    </li>
  );
}

function RunItYourself() {
  const repo = REPO_URL.replace(/\/+$/, "");
  const cloneUrl = repo.endsWith(".git") ? repo : `${repo}.git`;
  const folder = repo.split("/").pop()?.replace(/\.git$/, "") || "community-bot";
  const path = (p: string) => <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[13px] text-ink">{p}</code>;

  return (
    <section aria-labelledby="setup-title" className="mt-16 sm:mt-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Open source, MIT licence</p>
        <h2 id="setup-title" className="mt-2 font-display text-2xl sm:text-3xl">
          Run it yourself in 10 minutes
        </h2>
        <p className="mt-2 text-muted">You need Node 22 and a free Supabase project. The Bots can run on the mock backend first, so no model key is needed to try it.</p>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <ol className="space-y-6">
          <SetupStep n={1} title="Clone the repository" code={`git clone ${cloneUrl}\ncd ${folder}`} />
          <SetupStep n={2} title="Install" code="npm install" />
          <SetupStep n={3} title="Create your settings file" code="cp .env.example .env" />
          <SetupStep
            n={4}
            title="Set up Supabase"
            code={"VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key"}
          >
            In the Supabase SQL editor, run {path("supabase/migrations/0001_init.sql")}, then the other files in {path("supabase/migrations")} in filename order. Then put
            your project URL and anon key in {path(".env")}:
          </SetupStep>
          <SetupStep n={5} title="Start the worker" code="npm run worker">
            The worker reads the service role key from {path("apps/worker/.env")}. Never put that key in a {path("VITE_")} variable. Leave {path("BACKEND=mock")} for a
            first run.
          </SetupStep>
          <SetupStep n={6} title="Start the web app" code="npm run dev" />
        </ol>
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="flex items-center gap-2 font-medium">
              <FlaskConical size={16} className="text-warn" aria-hidden />
              No setup
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Open this site with{" "}
              <a href={appUrl("/?sample=1")} className="font-medium text-accent hover:underline">
                ?sample=1
              </a>{" "}
              to use the sample world. Everything in it is labelled sample.
            </p>
          </div>
          <div className="card p-5">
            <p className="font-medium">Source code</p>
            <p className="mt-1.5 text-sm text-muted">Read it, fork it, or open an issue.</p>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              <span className="truncate">{repo.replace(/^https?:\/\//, "")}</span>
              <ExternalLink size={14} className="shrink-0" aria-hidden />
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function BackendNote() {
  const source = useData();
  if (source.kind === "mock") {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <SampleBadge />
        <span className="text-muted">You are looking at sample data. The runs and counts below come from the mock backend.</span>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="pill border-ok/30 bg-ok-soft text-ok">
        <Server size={12} aria-hidden />
        Live backend
      </span>
      <span className="text-muted">This page reads this site's Supabase backend. Each run below shows which brain its Bots used.</span>
    </div>
  );
}

/** /how-it-works: the pipeline, which backend each run used, and evidence checked in this browser. */
export function HowItWorks() {
  usePageTitle("How it works");
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-3xl" data-tour="how">
        <p className="eyebrow">Community Bots</p>
        <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl sm:leading-[1.08]">How it works</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Each community has its own Bot that speaks for it, using only what is on the community's card. When an organiser asks for a collab, the Bots find partners and
          negotiate a joint event in a thread you can watch. Bots propose; organisers decide. Nothing is agreed until every organiser says yes.
        </p>
        <BackendNote />
      </header>

      <Pipeline />

      <div className="mt-16 grid gap-6 sm:mt-20 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <RunsByBackend />
        <EvidenceCheck />
      </div>

      <RunItYourself />
    </div>
  );
}
