import { motion } from "framer-motion";
import { CalendarDays, FileText, History, MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useIdentity } from "../../app/identity";
import { AvatarStack } from "../../components/Avatar";
import { BackendBadge, SampleBadge } from "../../components/Badges";
import { Dialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/States";
import { Timeline } from "../thread/Timeline";
import { clockTime, joinNames, shortDate } from "../../lib/format";
import { buildTimeline } from "../../lib/timeline";
import { DealDetails, ReplayEnd } from "./DealSummary";
import { buildSteps, frameAt } from "./frames";
import type { ReplayBundle, ReplayData } from "./model";
import { scheduleFromDelays } from "./player";
import { ReplayControls } from "./ReplayControls";
import { useReplayKeys, useReplayPlayer } from "./useReplayPlayer";

const SM = "(min-width: 640px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Height of the app's sticky header, so the desktop controls can stick right below it. */
function useHeaderHeight(fallback = 64): number {
  const [height, setHeight] = useState(fallback);
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>("#root header");
    if (!header) return;
    const update = () => setHeight(Math.round(header.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

const scrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/** "Fri 16 Oct 2026" in local time. */
function recordedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shortDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${d.getFullYear()}`;
}

const ORIGIN_NOTE: Record<ReplayData["origin"], string | null> = {
  source: null,
  file: "A recording bundled with this site. It plays the same way every time.",
  sample: "The bundled recording could not be loaded, so this plays the confirmed run of a fresh sample world.",
};

function ReplayHeader({ data, demo }: { data: ReplayData; demo: boolean }) {
  const { run, communities } = data;
  const recorded = recordedDate(run.createdAt);
  const note = ORIGIN_NOTE[data.origin];
  return (
    <header>
      <p className="eyebrow flex items-center gap-1.5">
        <History size={14} aria-hidden />
        {demo ? "Demo replay" : "Replay"}
      </p>
      <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl sm:leading-[1.08]">{run.need}</h1>
      <div className="mt-5 flex items-center gap-3">
        <AvatarStack items={communities} size={28} />
        <p className="min-w-0 text-sm text-muted">{joinNames(communities.map((c) => c.name))}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <BackendBadge backend={run.backend} title="Which brain the Bots used in this run" />
        {run.backend === "mock" ? <SampleBadge /> : null}
        {recorded ? (
          <span className="pill border-line bg-surface text-muted" title={`${recorded}, ${clockTime(run.createdAt)}`}>
            <CalendarDays size={12} aria-hidden />
            Recorded {recorded}
          </span>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
    </header>
  );
}

function CompilingRow() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted"
      aria-hidden
    >
      <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent">
        <FileText size={14} />
      </span>
      <span>Scribe Bot is compiling the deal</span>
      <span className="typing-dots text-faint">
        <span />
        <span />
        <span />
      </span>
    </motion.div>
  );
}

/** Plays one loaded recording. Remount (key) to play another. */
export function ReplayView({ bundle, demo }: { bundle: ReplayBundle; demo: boolean }) {
  const { data, threadRunId, eventDealId } = bundle;
  const { communityIds } = useIdentity();
  const desktop = useMediaQuery(SM);
  const headerHeight = useHeaderHeight();

  const steps = useMemo(() => buildSteps(data), [data]);
  const schedule = useMemo(() => scheduleFromDelays(steps.map((s) => s.delayMs)), [steps]);
  const player = useReplayPlayer(schedule, true);
  const hasPosts = data.messages.length > 0;
  useReplayKeys(player, hasPosts);

  const frame = useMemo(() => frameAt(steps, data.run, player.revealed), [steps, data.run, player.revealed]);
  const items = useMemo(() => buildTimeline({ run: frame.run, messages: frame.messages, deals: frame.deals, approvals: [] }), [frame]);
  const waitingFor = player.playing ? frame.next : null;
  const typing = waitingFor?.kind === "message" && waitingFor.message.role === "bot" ? waitingFor.message.communityId : null;
  const compiling = waitingFor?.kind === "deal";
  const finalDeal = data.deals[data.deals.length - 1] ?? null;

  const [openRound, setOpenRound] = useState<number | null>(null);
  const openDeal = openRound === null ? null : (frame.deals.find((d) => d.round === openRound) ?? null);

  // Follow the newest post while the reader is near the bottom; leave them alone if they scrolled up.
  const bottomRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const update = () => {
      const el = bottomRef.current;
      if (el) follow.current = el.getBoundingClientRect().top <= window.innerHeight + 240;
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    if (!player.playing || player.revealed === 0 || !follow.current) return;
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [player.revealed, player.playing]);
  const finished = hasPosts && frame.finished;
  useEffect(() => {
    if (finished && follow.current) endRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [finished]);

  const { restart } = player;
  const onRestart = useCallback(() => {
    restart();
    follow.current = true;
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [restart]);

  const style = { "--replay-top": `${headerHeight}px` } as CSSProperties;

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12" style={style} data-tour="replay">
      <ReplayHeader data={data} demo={demo} />

      {hasPosts ? (
        <>
          <div className="sticky bottom-0 z-20 order-last -mx-4 mt-6 border-t border-line bg-bg/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:top-(--replay-top) sm:bottom-auto sm:order-none sm:mx-0 sm:mt-5 sm:border-t-0 sm:bg-bg sm:px-0 sm:pb-0 sm:backdrop-blur-none">
            <div className="sm:rounded-xl sm:border sm:border-line sm:bg-surface sm:p-3 sm:shadow-sm">
              <ReplayControls player={player} shown={frame.posts.shown} total={frame.posts.total} onRestart={onRestart} tooltipSide={desktop ? "bottom" : "top"} />
            </div>
          </div>
          <p className="present-hide mt-2 hidden text-xs text-faint sm:block">
            <kbd className="kbd">Space</kbd> plays or pauses, <kbd className="kbd">→</kbd> shows the next post.
          </p>

          <section aria-label="Recorded conversation" className="mt-8">
            <Timeline items={items} cards={data.cards} names={data.names} typing={typing} myCommunityIds={communityIds} onOpenDeal={setOpenRound} />
            {compiling ? <CompilingRow /> : null}
            <div ref={bottomRef} className="h-px scroll-mb-[calc(7rem+env(safe-area-inset-bottom))] sm:scroll-mb-8" aria-hidden />
          </section>

          {finished ? (
            <ReplayEnd
              sectionRef={endRef}
              run={data.run}
              deal={finalDeal}
              communities={data.communities}
              names={data.names}
              threadRunId={threadRunId}
              eventDealId={eventDealId}
              onRestart={onRestart}
            />
          ) : null}
        </>
      ) : (
        <div className="card mt-8">
          <EmptyState
            icon={<MessagesSquare size={28} aria-hidden />}
            title="Nothing to replay yet"
            body="This run has no posts. Replays start with the organiser's request and follow every Bot post after it."
            action={
              threadRunId ? (
                <Link to={`/run/${threadRunId}`} className="btn">
                  Open the live thread
                </Link>
              ) : (
                <Link to="/board" className="btn">
                  Back to the board
                </Link>
              )
            }
          />
        </div>
      )}

      <Dialog open={openDeal !== null} onClose={() => setOpenRound(null)} title={openDeal ? openDeal.deal.title : "Deal"}>
        {openDeal ? <DealDetails deal={openDeal.deal} communities={data.communities} names={data.names} /> : null}
      </Dialog>
    </div>
  );
}
