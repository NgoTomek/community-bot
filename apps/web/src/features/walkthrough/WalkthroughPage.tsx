import type { Card } from "@community-bots/core";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarCheck, Check, FileText, MessagesSquare, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../app/title";
import { useTour } from "../../app/tour";
import { Avatar } from "../../components/Avatar";
import { SampleBadge } from "../../components/Badges";
import { ErrorState, Skeleton, SkeletonCard } from "../../components/ui/States";
import { useData } from "../../data/DataProvider";
import { useLive } from "../../data/hooks";
import { appUrl } from "../../lib/share";
import { Announcements } from "../event/Announcements";
import { DealDetails } from "../replay/DealSummary";
import { loadDemoReplay } from "../replay/load";
import type { ReplayBundle, ReplayData } from "../replay/model";
import { useReplayKeys } from "../replay/useReplayPlayer";
import { useNewRequest } from "../request/NewRequest";
import { PostCard } from "../thread/Timeline";

const DEMO_URL = `${import.meta.env.BASE_URL}demo-run.json`;

type Beat = { kind: "cast" } | { kind: "message"; index: number } | { kind: "deal" } | { kind: "decide" } | { kind: "live" };

const CHAPTERS = ["The communities", "The ask", "The Bots negotiate", "The deal", "Humans decide", "It goes live"];

const CURRENT = "rounded-xl ring-2 ring-accent/60 ring-offset-4 ring-offset-bg max-lg:scroll-mb-80";

function chapterOf(beat: Beat, data: ReplayData): number {
  if (beat.kind === "cast") return 0;
  if (beat.kind === "message") return data.messages[beat.index].message.role === "human" ? 1 : 2;
  if (beat.kind === "deal") return 3;
  return beat.kind === "decide" ? 4 : 5;
}

/** What the visitor is looking at, in plain words. */
function narrate(beat: Beat, data: ReplayData): { title: string; body: string } {
  const lead = data.names[data.run.leadId] ?? "One community";
  if (beat.kind === "cast") {
    return {
      title: "Three communities, one event",
      body: `${lead} wants to run an event and needs partners. Each community has its own Bot, which speaks only for that community and only from what is on its card.`,
    };
  }
  if (beat.kind === "message") {
    const { message } = data.messages[beat.index];
    const name = data.names[message.communityId] ?? message.speaker.replace(/ Bot$/, "");
    if (message.role === "human") {
      return {
        title: "An organiser asks, in one sentence",
        body: "That is all a person typed. From here the Bots do the legwork, in the open, where every organiser can read along and step in.",
      };
    }
    switch (message.stance) {
      case "question":
        return { title: `${name}'s Bot opens the conversation`, body: "It restates what its organiser asked for, says what its own community can bring, and asks the other Bots what they can offer." };
      case "offer":
        return /^proposal\b/i.test(message.text)
          ? {
              title: `${name}'s Bot proposes a plan`,
              body: "A date, a venue, who hosts and who brings what. The date has to be in the future on a day every community allows, and the group has to fit every limit a community has set.",
            }
          : {
              title: `${name}'s Bot makes an offer`,
              body: `It answers for ${name}: what it can bring and what it would like in return. The quote under the message is checked against ${name}'s card, so nothing is made up.`,
            };
      case "accept":
        return { title: `${name}'s Bot agrees`, body: `It accepts the plan and confirms what ${name} will bring.` };
      case "counter":
        return { title: `${name}'s Bot pushes back`, body: "It asks for a change before it agrees. The other Bots answer in their next turn." };
      case "decline":
        return { title: `${name}'s Bot says no`, body: "A Bot can decline when the plan does not work for its community." };
      default:
        return { title: `${name}'s Bot replies`, body: "Each Bot speaks only for its own community." };
    }
  }
  if (beat.kind === "deal") {
    return {
      title: "The Scribe writes the deal",
      body: "Once every Bot has agreed, the Scribe turns what they agreed, and only that, into a deal: title, date, time, venue and what each community brings.",
    };
  }
  if (beat.kind === "decide") {
    return {
      title: "Every organiser says yes",
      body: `Each organiser gets the deal on their phone and can approve it, ask for a renegotiation with a note, or decline. Nothing is published until all of them approve.${
        data.run.status === "confirmed" ? " Here all three approved in the first round." : ""
      }`,
    };
  }
  return {
    title: "The event page goes live",
    body: "With every approval in, the event page flips from Draft to Confirmed: RSVPs, a calendar file, a share link and a QR code. Each community also gets an announcement to post.",
  };
}

function beatMs(beat: Beat, data: ReplayData): number {
  if (beat.kind === "message") return Math.min(9000, 3200 + data.messages[beat.index].message.text.length * 30);
  return beat.kind === "cast" ? 7000 : 6500;
}

/** /walkthrough: the bundled recording told as a story, one beat at a time, with what each Bot did and why. */
export default function WalkthroughPage() {
  usePageTitle("Walkthrough");
  const source = useData();
  const bundle = useLive("walkthrough:demo", () => loadDemoReplay(source, DEMO_URL, (url, init) => fetch(url, init)), { topics: [], poll: "never" });

  if (bundle.data) return <Story bundle={bundle.data} />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {bundle.error ? (
        <ErrorState title="Could not load the walkthrough" message={bundle.error} onRetry={bundle.reload} />
      ) : (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-9 w-2/3" />
          <SkeletonCard />
          <SkeletonCard lines={2} />
        </div>
      )}
    </div>
  );
}

function Story({ bundle }: { bundle: ReplayBundle }) {
  const { data, eventDealId, threadRunId } = bundle;
  const tour = useTour();
  const { open } = useNewRequest();
  const beats = useMemo<Beat[]>(
    () => [
      { kind: "cast" },
      ...data.messages.map((_, index): Beat => ({ kind: "message", index })),
      ...(data.deals.length ? [{ kind: "deal" } as Beat] : []),
      { kind: "decide" },
      { kind: "live" },
    ],
    [data],
  );
  const last = beats.length - 1;
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const beat = beats[at];
  const chapter = chapterOf(beat, data);
  const { title, body } = narrate(beat, data);
  const running = playing && at < last;

  const next = useCallback(() => {
    setPlaying(false);
    setAt((i) => Math.min(i + 1, last));
  }, [last]);
  const back = useCallback(() => {
    setPlaying(false);
    setAt((i) => Math.max(i - 1, 0));
  }, []);
  const toggle = useCallback(() => {
    if (at >= last) {
      setAt(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  }, [at, last]);

  useReplayKeys({ toggle, skip: next });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setAt((i) => Math.min(i + 1, last)), beatMs(beats[at], data));
    return () => window.clearTimeout(timer);
  }, [running, at, beats, data, last]);

  // Keep the newest part of the story in view. On wide screens the chat scrolls inside its own
  // panel, like a chat app, so the page itself never moves.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const panel = stage.scrollHeight > stage.clientHeight + 1;
      const current = beats[at].kind === "cast" ? null : stage.querySelector<HTMLElement>("[data-story-current]");
      if (!panel) {
        current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      if (!current) {
        stage.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const s = stage.getBoundingClientRect();
      const c = current.getBoundingClientRect();
      let delta = 0;
      if (c.height > s.height - 24 || c.top < s.top) delta = c.top - s.top - 8;
      else if (c.bottom > s.bottom) delta = c.bottom - s.bottom + 16;
      if (delta) stage.scrollBy({ top: delta, behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [at, beats]);

  const shownCount = beat.kind === "cast" ? 0 : beat.kind === "message" ? beat.index + 1 : data.messages.length;
  const shown = data.messages.slice(0, shownCount).map((m) => m.message);
  const deal = data.deals[data.deals.length - 1] ?? null;
  const pastDeal = beat.kind === "deal" || beat.kind === "decide" || beat.kind === "live";
  const pastDecide = beat.kind === "decide" || beat.kind === "live";
  const confirmed = data.run.status === "confirmed";

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 max-lg:pb-80 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Walkthrough</p>
          <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">Watch three Bots plan one event</h1>
          <p className="mt-2 max-w-2xl text-muted">A recorded sample negotiation, one message at a time, with what each Bot did and why.</p>
        </div>
        <SampleBadge />
      </header>

      <div className="mt-6 grid gap-8 lg:h-[calc(100dvh-15.5rem)] lg:min-h-[520px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:overflow-y-auto" aria-label="Story">
          <ol className="mb-6 space-y-1 max-lg:hidden">
            {CHAPTERS.map((label, i) => (
              <li key={label} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === chapter ? "bg-accent-soft font-semibold text-accent" : i < chapter ? "text-ink" : "text-faint"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i < chapter ? "bg-ok-soft text-ok" : i === chapter ? "bg-accent-bg text-accent-fg" : "bg-sunken"}`}>
                  {i < chapter ? <Check size={13} aria-hidden /> : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <div className="card p-5 max-lg:fixed max-lg:inset-x-3 max-lg:bottom-3 max-lg:z-40 max-lg:shadow-[var(--shadow-pop)]">
            <p className="eyebrow">
              {CHAPTERS[chapter]} · {at + 1} of {beats.length}
            </p>
            <div className="mt-3 flex gap-1" aria-hidden>
              {beats.map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i <= at ? "bg-accent-bg" : "bg-sunken"}`} />
              ))}
            </div>
            <div aria-live="polite">
              <h2 className="mt-4 font-display text-xl leading-tight sm:text-2xl">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[15px]">{body}</p>
            </div>
            <div className="mt-5 flex items-center gap-2">
              <button type="button" className="btn btn-ghost" onClick={back} disabled={at === 0}>
                <ArrowLeft size={16} aria-hidden /> Back
              </button>
              <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label={running ? "Pause" : "Play by itself"} title={running ? "Pause" : "Play by itself"}>
                {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              </button>
              <div className="ml-auto">
                {at < last ? (
                  <button type="button" className="btn btn-primary" onClick={next}>
                    Next <ArrowRight size={16} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setPlaying(false);
                      setAt(0);
                    }}
                  >
                    <RotateCcw size={16} aria-hidden /> Start over
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-faint max-sm:hidden">
              <kbd className="kbd">→</kbd> next · <kbd className="kbd">←</kbd> back · <kbd className="kbd">Space</kbd> play
            </p>
          </div>
        </aside>

        <div ref={stageRef} className="min-w-0 space-y-4 lg:overflow-y-auto lg:p-2 lg:pb-8 lg:pr-3">
          {beat.kind === "cast" ? (
            <div className="grid gap-4 md:grid-cols-3">
              {data.communities.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}>
                  <CastCard id={c.id} name={c.name} card={data.cards[c.id]} lead={c.id === data.run.leadId} />
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <MessagesSquare size={16} aria-hidden /> The group chat between {data.communities.map((c) => c.name).join(", ")}
            </p>
          )}

          <ol className="space-y-3">
            {shown.map((message, i) => {
              const current = beat.kind === "message" && i === shown.length - 1;
              return (
                <motion.li
                  key={message.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  data-story-current={current ? "" : undefined}
                  className={current ? CURRENT : beat.kind === "message" ? "opacity-75" : ""}
                >
                  <PostCard message={message} cards={data.cards} names={data.names} />
                </motion.li>
              );
            })}
          </ol>

          {pastDeal && deal ? (
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-story-current={beat.kind === "deal" ? "" : undefined} className={`card p-5 ${beat.kind === "deal" ? CURRENT : ""}`}>
              <p className="eyebrow flex items-center gap-2">
                <FileText size={14} aria-hidden /> Deal written by the Scribe · round {deal.round}
              </p>
              <h3 className="mb-4 mt-2 font-display text-2xl leading-tight">{deal.deal.title}</h3>
              <DealDetails deal={deal.deal} communities={data.communities} names={data.names} />
            </motion.section>
          ) : null}

          {pastDecide ? (
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-story-current={beat.kind === "decide" ? "" : undefined} className={`card p-5 ${beat.kind === "decide" ? CURRENT : ""}`}>
              <p className="eyebrow">The organisers' decisions</p>
              <ul className="mt-3 space-y-3">
                {data.communities.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <Avatar id={c.id} name={c.name} size={30} />
                    <span className="flex-1 font-medium">{c.name}</span>
                    {confirmed ? (
                      <span className="pill border-ok/30 bg-ok-soft text-ok">
                        <BadgeCheck size={12} aria-hidden /> Approved
                      </span>
                    ) : (
                      <span className="pill">Waiting</span>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          ) : null}

          {beat.kind === "live" ? (
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} data-story-current="" className={`card p-5 ${CURRENT}`}>
              <p className="eyebrow">{confirmed ? "Confirmed" : "Draft"}</p>
              <h3 className="mt-2 font-display text-2xl leading-tight">{deal?.deal.title ?? "The event"}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {eventDealId ? (
                  <Link to={`/event/${eventDealId}`} className="btn btn-primary">
                    <CalendarCheck size={16} aria-hidden /> Open the event page
                  </Link>
                ) : null}
                {threadRunId ? (
                  <Link to={`/run/${threadRunId}`} className="btn">
                    See the full thread
                  </Link>
                ) : null}
                <button type="button" className="btn" onClick={() => open()}>
                  Start your own collab
                </button>
                {tour.available ? (
                  <button type="button" className="btn btn-ghost" onClick={() => tour.start()}>
                    <Sparkles size={16} className="text-accent" aria-hidden /> Tour the rest of the site
                  </button>
                ) : null}
              </div>
              {data.announcements.length ? (
                <div className="mt-6">
                  <Announcements items={data.announcements} names={data.names} url={eventDealId ? appUrl(`/event/${eventDealId}`) : appUrl("/")} confirmed={confirmed} />
                </div>
              ) : null}
            </motion.section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CastCard({ id, name, card, lead }: { id: string; name: string; card: Card | undefined; lead: boolean }) {
  const plain = (lines: string[] | undefined) => (lines ?? []).filter((line) => !/^GUESS:/i.test(line));
  const offers = plain(card?.offers).slice(0, 2);
  const needs = plain(card?.needs).slice(0, 1);
  const days = card?.constraints.days ?? [];
  const max = card?.constraints.maxGroupSize ?? null;
  const limits = [days.length ? days.join(", ") : null, max ? `up to ${max} people` : null].filter(Boolean).join(" · ");
  return (
    <article className="card h-full p-4">
      <header className="flex items-center gap-3">
        <Avatar id={id} name={name} size={36} />
        <div className="min-w-0">
          <p className="font-medium leading-tight">{name}</p>
          <p className="text-xs text-muted">{lead ? "Asked for the collab" : "Partner"}</p>
        </div>
      </header>
      <dl className="mt-4 space-y-3 text-sm">
        {offers.length ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Offers</dt>
            <dd className="mt-0.5">{offers.join(" · ")}</dd>
          </div>
        ) : null}
        {needs.length ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Needs</dt>
            <dd className="mt-0.5">{needs.join(" · ")}</dd>
          </div>
        ) : null}
        {limits ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-faint">Limits</dt>
            <dd className="mt-0.5">{limits}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
