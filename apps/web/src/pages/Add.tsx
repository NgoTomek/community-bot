import type { Card } from "@community-bots/core";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Check, Globe, KeyRound, Loader2, PenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useIdentity } from "../app/identity";
import { usePresenter } from "../app/presenter";
import { usePageTitle } from "../app/title";
import { SampleBadge } from "../components/Badges";
import { CopyButton } from "../components/CopyButton";
import { Qr } from "../components/Qr";
import { ConfirmDialog } from "../components/ui/Dialog";
import { ErrorState, SkeletonCard } from "../components/ui/States";
import { Tooltip, useGate } from "../components/ui/Tooltip";
import { useData } from "../data/DataProvider";
import { errorText, useCommunities, useCommunity, useJob, useNow } from "../data/hooks";
import type { Job } from "../data/types";
import { CardEditor, GuessLegend, StickyBar, useCardDraft } from "../features/card/CardEditor";
import { linkLabel, normaliseUrl, readDraftResult, safeHref } from "../features/card/cardForm";
import { JobSteps } from "../features/card/JobSteps";
import { DRAFT_STEPS } from "../features/card/progress";
import { useNewRequest } from "../features/request/NewRequest";
import { plural } from "../lib/format";

const FLOW = ["Paste your link", "Scout Bot drafts", "You check", "Your organiser link"];
const SLOW_AFTER_S = 75;

function FlowSteps({ current }: { current: number }) {
  return (
    <nav aria-label="Steps">
      <p className="eyebrow sm:hidden">
        Step {current + 1} of {FLOW.length} · {FLOW[current]}
      </p>
      <ol className="flex items-center gap-2 max-sm:hidden">
        {FLOW.map((label, i) => (
          <li key={label} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular ${
                i < current ? "bg-ok-soft text-ok" : i === current ? "bg-accent-bg text-accent-fg" : "bg-sunken text-faint"
              }`}
              aria-hidden
            >
              {i < current ? <Check size={13} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={`text-sm ${i === current ? "font-medium" : "text-muted"}`}>
              {label}
              {i < current ? <span className="sr-only"> (done)</span> : null}
            </span>
            {i < FLOW.length - 1 ? <span className="mx-1 h-px w-6 bg-line-strong lg:w-10" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function MockNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl bg-warn-soft p-4 text-sm leading-relaxed sm:flex-row sm:gap-3" role="note">
      <span className="shrink-0">
        <SampleBadge />
      </span>
      <p>{children}</p>
    </div>
  );
}

function LinkForm({
  url,
  onUrl,
  error,
  busy,
  onSubmit,
  autoFocus = false,
}: {
  url: string;
  onUrl: (url: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const gate = useGate("submit_job");
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="community-url" className="font-medium">
        Paste your community link
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Globe size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id="community-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            className="input h-14 pl-12! text-lg!"
            placeholder="https://..."
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="community-url-help"
          />
        </div>
        <Tooltip label={gate.reason} focusable={gate.disabled}>
          <button type="submit" className="btn btn-primary btn-lg h-14 w-full sm:w-auto" disabled={busy || gate.disabled}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Sparkles size={18} aria-hidden />}
            Draft my card
          </button>
        </Tooltip>
      </div>
      <p id="community-url-help" className={`mt-2 text-sm ${error ? "text-bad" : "text-muted"}`} aria-live="polite">
        {error ?? "Your website, or a public Meetup, Luma, LinkedIn or Discord page."}
      </p>
    </form>
  );
}

const NEXT_STEPS = [
  { icon: Bot, title: "The Scout Bot drafts a card", body: "It reads the public page and marks anything it had to guess." },
  { icon: PenLine, title: "You check it", body: "Edit any field. Nothing goes on the board until you confirm." },
  { icon: KeyRound, title: "You get your organiser link", body: "No account needed. The link is how you approve deals, on any device." },
];

function LinkStep(props: Parameters<typeof LinkForm>[0] & { mock: boolean; submitError: string | null }) {
  const { mock, submitError, ...form } = props;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <FlowSteps current={0} />
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">Add your community</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
        Paste a public page about your community. Its Bot drafts a card in under a minute, then you check it before anything goes live.
      </p>
      <div className="mt-8">
        <LinkForm {...form} autoFocus />
      </div>
      {submitError ? (
        <div className="mt-4">
          <ErrorState title="The draft could not start" message={submitError} onRetry={form.onSubmit} />
        </div>
      ) : null}
      {mock ? (
        <div className="mt-6">
          <MockNotice>In sample mode the Scout Bot does not open the page. It invents a card from the words in your link.</MockNotice>
        </div>
      ) : null}
      <ol className="mt-12 grid gap-4 sm:grid-cols-3">
        {NEXT_STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="card p-5">
            <span className="flex items-center gap-2 text-faint">
              <Icon size={18} aria-hidden />
              <span className="text-xs font-semibold tabular">{i + 1}</span>
            </span>
            <p className="mt-3 font-medium leading-snug">{title}</p>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  const href = safeHref(url);
  if (!href) return <span className="break-all font-medium text-ink">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-current">
      {linkLabel(url)}
    </a>
  );
}

function DraftingStep({ url, job, startedAt, mock, onStartOver }: { url: string; job: Job | null | undefined; startedAt: number | null; mock: boolean; onStartOver: () => void }) {
  const now = useNow(5000);
  const slow = startedAt !== null && now.getTime() - startedAt > SLOW_AFTER_S * 1000;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <FlowSteps current={1} />
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">Drafting your card</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        {url ? (
          <>
            The Scout Bot is reading <SourceLink url={url} />.{" "}
          </>
        ) : null}
        This usually takes under a minute.
      </p>
      <div className="card mt-8 p-5 sm:p-6" aria-busy="true">
        <JobSteps defs={DRAFT_STEPS} job={job} label="Drafting progress" startedAt={startedAt} />
      </div>
      {slow ? (
        <p className="mt-4 text-sm text-muted" role="status">
          This is taking longer than usual. The Bot may be busy with other jobs.{" "}
          <button type="button" className="font-medium text-accent hover:underline" onClick={onStartOver}>
            Start over
          </button>
        </p>
      ) : null}
      {mock ? (
        <div className="mt-6">
          <MockNotice>The sample backend does not open the page. It invents a card from the words in your link, so check every field.</MockNotice>
        </div>
      ) : null}
      <div className="mt-8 grid gap-4 opacity-60 sm:grid-cols-2" aria-hidden>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
      <button type="button" className="btn btn-ghost mt-6" onClick={onStartOver}>
        Use a different link
      </button>
    </div>
  );
}

interface Saved {
  id: string;
  name: string;
  inbox: string | null;
}

function CheckStep({
  card,
  url,
  mock,
  onSaved,
  onStartOver,
}: {
  card: Card;
  url: string;
  mock: boolean;
  onSaved: (saved: Saved) => void;
  onStartOver: () => void;
}) {
  const source = useData();
  const { ensurePasscode } = usePresenter();
  const { addKnown } = useIdentity();
  const communities = useCommunities();
  const editor = useCardDraft(card);
  const gate = useGate("save_card");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"replace" | "restart" | null>(null);
  const taken = communities.data?.find((c) => c.id === editor.id) ?? null;
  const errorCount = Object.keys(editor.errors).length + (editor.other ? 1 : 0);

  const save = async () => {
    setDialog(null);
    if (!editor.valid) return;
    const passcode = await ensurePasscode("Saving your card needs the organiser passcode.");
    if (passcode === false) return;
    setSaving(true);
    setError(null);
    try {
      const { id, inbox } = await source.saveCard(passcode, editor.card, "confirmed");
      if (inbox) addKnown({ inbox, communityId: id, name: editor.card.name });
      onSaved({ id, inbox, name: editor.card.name });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const status = !editor.valid
    ? `Fix ${plural(errorCount, "field")} to confirm.`
    : editor.guesses
      ? `${plural(editor.guesses, "guess", "guesses")} left.`
      : "Ready to confirm.";

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6 sm:pt-12">
      <FlowSteps current={2} />
      <div className="mt-6 max-w-3xl">
        <h1 className="font-display text-3xl sm:text-4xl">Check your card</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          {url ? (
            <>
              The Scout Bot drafted this from <SourceLink url={url} />.{" "}
            </>
          ) : null}
          Fix anything that is wrong, then confirm. Nothing goes on the board until you do.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        {mock ? <MockNotice>This card was invented from the text of the link, not read from the page. Treat every field as a guess.</MockNotice> : null}
        <GuessLegend count={editor.guesses} />
      </div>
      <div className="mt-6">
        <CardEditor editor={editor} takenBy={taken ? { id: taken.id, name: taken.name } : null} />
      </div>
      {error ? (
        <div className="mt-6">
          <ErrorState title="The card was not saved" message={error} onRetry={() => void save()} />
        </div>
      ) : null}
      {editor.other ? <p className="mt-4 text-sm text-bad">{editor.other}</p> : null}
      <StickyBar>
        <p className={`mr-auto text-sm ${editor.valid ? "text-muted" : "text-bad"}`} aria-live="polite">
          {status}
          {editor.valid && editor.guesses ? <span className="max-sm:hidden"> They stay highlighted on your card until checked.</span> : null}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => (editor.dirty ? setDialog("restart") : onStartOver())}>
          Start over
        </button>
        <Tooltip label={gate.reason} focusable={gate.disabled}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!editor.valid || saving || gate.disabled}
            onClick={() => (taken ? setDialog("replace") : void save())}
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            Confirm card
          </button>
        </Tooltip>
      </StickyBar>
      <ConfirmDialog
        open={dialog === "replace"}
        onClose={() => setDialog(null)}
        onConfirm={() => void save()}
        title={`Replace the card for ${taken?.name ?? "this community"}?`}
        body={`A community already uses the profile link /c/${editor.id}. Confirming replaces its card with this one, and its Bot uses the new card from the next negotiation.`}
        confirmLabel="Replace card"
        destructive
        busy={saving}
      />
      <ConfirmDialog
        open={dialog === "restart"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          onStartOver();
        }}
        title="Start over?"
        body="Your edits to this card will be lost."
        confirmLabel="Start over"
        destructive
      />
    </div>
  );
}

function SavedStep({ saved, mock }: { saved: { id: string; name: string | null; inbox: string | null }; mock: boolean }) {
  const { identities, linkFor } = useIdentity();
  const { open } = useNewRequest();
  const community = useCommunity(saved.id);
  const name = saved.name ?? community.data?.name ?? "Your community";
  const inbox = saved.inbox ?? identities.find((i) => i.communityId === saved.id)?.inbox ?? null;
  const link = inbox ? linkFor({ inbox, communityId: saved.id }) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <FlowSteps current={3} />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        <span className="mt-8 grid size-12 place-items-center rounded-full bg-ok-soft text-ok" aria-hidden>
          <Check size={24} strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl">{name} is on the board</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">Its Bot can now find partners and negotiate joint events. Nothing is agreed until you approve it.</p>

        <section className="card mt-8 p-5 sm:p-6" aria-labelledby="organiser-link-title">
          <h2 id="organiser-link-title" className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound size={18} className="text-accent" aria-hidden />
            Your organiser link
          </h2>
          {link ? (
            <div className="mt-4 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0 space-y-4">
                <p className="leading-relaxed">
                  This link is the key to act for {name}: approving deals, asking for changes and answering requests. Keep it private, like a password. It works on your
                  phone too: scan the code, or send the link to yourself.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input readOnly value={link} aria-label="Your organiser link" className="input font-mono text-sm!" onFocus={(e) => e.currentTarget.select()} />
                  <CopyButton text={link} label="Copy link" className="btn shrink-0" />
                </div>
                <p className="text-sm text-muted">Saved in this browser, so the header now shows who you are. You can copy the link again from that menu.</p>
                {mock ? <p className="text-sm text-warn">Sample mode: this link only works in this browser's sample world.</p> : null}
              </div>
              <div className="justify-self-center sm:justify-self-end">
                <Qr value={link} size={148} label="Scan to open on your phone" />
              </div>
            </div>
          ) : (
            <p className="mt-3 leading-relaxed">
              This instance did not hand back an organiser link. It comes from whoever runs this instance: ask them for the link for {name}. It is the key to act for your
              community, so keep it private once you have it.
            </p>
          )}
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => open({ leadId: saved.id })}>
            <Sparkles size={18} aria-hidden />
            Start a collab request
          </button>
          <Link to={`/c/${saved.id}`} className="btn btn-lg">
            View your profile
            <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

const jobUrl = (job: Job | null | undefined): string | null => {
  const params = job?.params as { url?: unknown } | null | undefined;
  return typeof params?.url === "string" ? params.url : null;
};

export default function Add() {
  usePageTitle("Add your community");
  const source = useData();
  const { ensurePasscode } = usePresenter();
  const [params, setParams] = useSearchParams();
  const urlParam = params.get("url");
  const jobParam = params.get("job");
  const savedParam = params.get("saved");
  const [url, setUrl] = useState(urlParam ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(jobParam);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const job = useJob(jobId);
  const mock = source.kind === "mock";

  const start = useCallback(
    async (raw: string) => {
      const checked = normaliseUrl(raw);
      if ("error" in checked) {
        setUrlError(checked.error);
        return;
      }
      setUrl(checked.url);
      setUrlError(null);
      setSubmitError(null);
      const passcode = await ensurePasscode("Drafting a card runs the Scout Bot, which needs the organiser passcode.");
      if (passcode === false) return;
      setSubmitting(true);
      try {
        const id = await source.submitJob(passcode, "draft_card", { url: checked.url });
        setJobId(id);
        setStartedAt(Date.now());
        setParams({ job: id }, { replace: true });
      } catch (err) {
        setSubmitError(errorText(err));
      } finally {
        setSubmitting(false);
      }
    },
    [ensurePasscode, source, setParams],
  );

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !urlParam || jobParam || savedParam) return;
    autoStarted.current = true;
    void start(urlParam);
  }, [urlParam, jobParam, savedParam, start]);

  const fromJob = jobUrl(job.data);
  const [filledFromJob, setFilledFromJob] = useState(false);
  if (fromJob && !filledFromJob) {
    setFilledFromJob(true);
    if (!url) setUrl(fromJob);
  }

  const draft = useMemo(() => (job.data?.status === "done" ? readDraftResult(job.data.result) : null), [job.data]);
  const sourceUrl = fromJob ?? url;
  const created = job.data ? Date.parse(job.data.createdAt) : Number.NaN;
  const since = startedAt ?? (Number.isNaN(created) ? null : created);

  const startOver = () => {
    setUrl(sourceUrl);
    setJobId(null);
    setStartedAt(null);
    setSaved(null);
    setSubmitError(null);
    setParams({}, { replace: true });
  };

  if (saved || savedParam) {
    return <SavedStep saved={saved ?? { id: savedParam!, name: null, inbox: null }} mock={mock} />;
  }

  if (!jobId) {
    return (
      <LinkStep
        url={url}
        onUrl={(value) => {
          setUrl(value);
          setUrlError(null);
        }}
        error={urlError}
        busy={submitting}
        onSubmit={() => void start(url)}
        mock={mock}
        submitError={submitError}
      />
    );
  }

  const failure =
    job.data?.status === "error"
      ? (job.data.error ?? "The Scout Bot could not finish.")
      : draft && !draft.ok
        ? draft.error
        : job.data === null
          ? "This draft is no longer available. Paste the link again to start over."
          : !job.data && job.error
            ? job.error
            : null;

  if (failure) {
    const loadFailed = !job.data && !!job.error;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <FlowSteps current={1} />
        <h1 className="mt-6 font-display text-3xl sm:text-4xl">The card could not be drafted</h1>
        <div className="mt-8">
          <ErrorState
            title={loadFailed ? "Could not check on the draft" : "The Scout Bot could not finish"}
            message={failure}
            onRetry={loadFailed ? job.reload : job.data === null ? undefined : () => void start(sourceUrl)}
          />
        </div>
        <div className="mt-10">
          <p className="mb-4 text-sm text-muted">Or try a different link:</p>
          <LinkForm
            url={url}
            onUrl={(value) => {
              setUrl(value);
              setUrlError(null);
            }}
            error={urlError ?? submitError}
            busy={submitting}
            onSubmit={() => void start(url)}
          />
        </div>
      </div>
    );
  }

  if (draft?.ok) {
    return (
      <CheckStep
        key={jobId}
        card={draft.card}
        url={sourceUrl}
        mock={mock || draft.backend === "mock"}
        onStartOver={startOver}
        onSaved={(result) => {
          setSaved(result);
          setParams({ saved: result.id }, { replace: true });
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return <DraftingStep url={sourceUrl} job={job.data} startedAt={since} mock={mock} onStartOver={startOver} />;
}
