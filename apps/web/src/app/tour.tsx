import { ArrowLeft, ArrowRight, MousePointerClick, Pause, Play, Sparkles, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { useRuns } from "../data/hooks";
import type { RequestSummary, Run } from "../data/types";
import { useNeedsYou } from "./needsYou";

/** sessionStorage: the step the guided tour is on, so a refresh keeps it. */
const STEP_KEY = "cb.tour";

interface StepData {
  runs: Run[];
  pending: RequestSummary[];
}

interface TourStep {
  title: string;
  body: string;
  /** What to try on this screen. */
  hint: string;
  /** Where the step happens, or null when the data has nothing to show there (the step then stays put). */
  route: (data: StepData) => string | null;
  /** The data-tour element to spotlight. */
  spot: string;
  /** Seconds before autoplay moves on. */
  seconds: number;
}

function liveRunPath({ runs }: StepData): string | null {
  const run = runs.find((r) => r.control === "running" && (r.status === "matching" || r.status === "negotiating" || r.status === "compiling")) ?? runs[0];
  return run ? `/run/${run.id}` : null;
}

function decisionPath({ runs, pending }: StepData): string | null {
  const id = pending.find((p) => p.status === "pending" && p.runId)?.runId ?? runs.find((r) => r.status === "pending_approval")?.id;
  return id ? `/run/${id}` : null;
}

function eventPath({ runs }: StepData): string | null {
  const dealId = runs.find((r) => r.status === "confirmed" && r.dealId)?.dealId;
  return dealId ? `/event/${dealId}` : null;
}

function replayPath({ runs }: StepData): string {
  const run = runs.find((r) => r.status === "confirmed") ?? runs[0];
  return run ? `/replay/${run.id}` : "/demo";
}

const BOARD = "/board";

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to the app",
    body: "This is the board every organiser sees. Each community's Bot finds partners and negotiates joint events here, in the open, and nothing is agreed until every organiser says yes.",
    hint: "New request starts a collab. Add a community drafts a card from a link.",
    route: () => BOARD,
    spot: "board-head",
    seconds: 9,
  },
  {
    title: "Every collab on one board",
    body: "A collab moves from Negotiating, to Waiting on others while organisers decide, to Confirmed. Anything that needs you is pinned at the top.",
    hint: "Open any collab to read the Bots' conversation.",
    route: () => BOARD,
    spot: "collabs",
    seconds: 9,
  },
  {
    title: "Every community has a card",
    body: "A Bot drafts each card from public pages: what the community offers and what it needs. Every line is quoted from the card, so matches rest on evidence, not guesses.",
    hint: "Filter by Space, Speakers or Audience, or press Start a collab from this.",
    route: () => BOARD,
    spot: "wall",
    seconds: 9,
  },
  {
    title: "Add a community from one link",
    body: "Paste a public page, like a Meetup group or a website. The Scout Bot drafts the card in under a minute, and the organiser checks it before anything goes live.",
    hint: "Paste any public link to watch a card being drafted.",
    route: () => "/add",
    spot: "add",
    seconds: 9,
  },
  {
    title: "The Bots negotiate in the open",
    body: "Each Bot speaks only for its own community, using what is on its card. A Scribe turns what they agreed into a deal: a future date every community allows, and a size every venue fits.",
    hint: "Post guidance to every Bot, or pause or stop the run from here.",
    route: liveRunPath,
    spot: "thread",
    seconds: 12,
  },
  {
    title: "Humans decide",
    body: "When a deal is ready, every organiser gets a link to approve it, decline it, or ask for a renegotiation with a note the Bots must address. Three rounds at most.",
    hint: "Make the call for your community: approve, renegotiate or decline.",
    route: decisionPath,
    spot: "decision",
    seconds: 10,
  },
  {
    title: "The event page goes live",
    body: "Once everyone approves, the event page flips from Draft to Confirmed, with RSVPs, a calendar file, a share link and QR code, and the Bots' announcements.",
    hint: "RSVP with any name, or press Add to calendar.",
    route: eventPath,
    spot: "rsvp",
    seconds: 10,
  },
  {
    title: "Replay any negotiation",
    body: "Every run is recorded. Replay it message by message to see what each Bot said and how the deal came together.",
    hint: "Press play, or step through it yourself.",
    route: replayPath,
    spot: "replay",
    seconds: 10,
  },
  {
    title: "Open source, ready to run",
    body: "MIT licensed. Another group can clone the repo and run this whole flow in about ten minutes, then plug in real Bots through Grok or any OpenAI-compatible model.",
    hint: "That's the tour. Explore on your own, or start it again.",
    route: () => "/how-it-works",
    spot: "how",
    seconds: 10,
  },
];

const LAST = TOUR_STEPS.length - 1;

interface TourValue {
  /** The tour is written for the in-browser data source only. */
  available: boolean;
  active: boolean;
  start: (autoplay?: boolean) => void;
  stop: () => void;
}

const TourContext = createContext<TourValue | null>(null);

function savedStep(): number | null {
  try {
    const raw = sessionStorage.getItem(STEP_KEY);
    const step = raw === null ? NaN : Number(raw);
    return Number.isInteger(step) && step >= 0 && step <= LAST ? step : null;
  } catch {
    return null;
  }
}

/** ?tour=1 starts the guided tour, ?tour=auto plays it by itself, ?tour=0 ends it. */
function initialTour(): { step: number | null; auto: boolean } {
  const param = new URLSearchParams(window.location.search).get("tour");
  if (param === "1" || param === "auto") return { step: 0, auto: param === "auto" };
  if (param === "0") return { step: null, auto: false };
  return { step: savedStep(), auto: false };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const source = useData();
  const runs = useRuns();
  const { pending } = useNeedsYou();
  const navigate = useNavigate();
  const location = useLocation();
  const available = source.kind === "mock";
  const [initial] = useState(initialTour);
  const [step, setStep] = useState<number | null>(available ? initial.step : null);
  const [auto, setAuto] = useState(initial.auto);
  const routed = useRef<number | null>(null);

  const start = useCallback(
    (autoplay = false) => {
      setAuto(autoplay);
      setStep(0);
      routed.current = 0;
      navigate(BOARD);
    },
    [navigate],
  );

  const stop = useCallback(() => {
    setAuto(false);
    setStep(null);
  }, []);

  // Drop ?tour= once read, so a reload or a shared link does not restart the tour.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("tour")) return;
    params.delete("tour");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    document.documentElement.classList.toggle("touring", step !== null);
    try {
      if (step === null) sessionStorage.removeItem(STEP_KEY);
      else sessionStorage.setItem(STEP_KEY, String(step));
    } catch {
      /* ignore */
    }
  }, [step]);

  // Go to each step's page once, when the runs it may point at have loaded. Later data changes
  // (a live run finishing) never pull the visitor away from where they clicked to.
  const data = useMemo<StepData>(() => ({ runs: runs.data ?? [], pending }), [runs.data, pending]);
  const ready = runs.data !== undefined || !runs.loading;
  useEffect(() => {
    if (step === null) {
      routed.current = null;
      return;
    }
    if (routed.current === step || !ready) return;
    routed.current = step;
    const target = TOUR_STEPS[step].route(data);
    if (target && target !== location.pathname) navigate(target);
  }, [step, ready, data, location.pathname, navigate]);

  // Spotlight the step's element and keep the card on the other side of it. React may re-mount
  // the element as data loads, so keep looking.
  const spot = step === null ? null : TOUR_STEPS[step].spot;
  const [side, setSide] = useState<Side>("right");
  useEffect(() => {
    if (!spot) return;
    let el: Element | null = null;
    let scrolled = false;
    const find = () => {
      if (el?.isConnected) return;
      el = document.querySelector(`[data-tour="${spot}"]`);
      if (!el) return;
      el.setAttribute("data-tour-spot", "");
      const rect = el.getBoundingClientRect();
      setSide(rect.left + rect.width / 2 > window.innerWidth * 0.55 ? "left" : "right");
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const first = window.setTimeout(find, 0);
    const timer = window.setInterval(find, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      el?.removeAttribute("data-tour-spot");
    };
  }, [spot, location.pathname]);

  const playing = auto && step !== null && step < LAST;
  useEffect(() => {
    if (!playing || step === null) return;
    const timer = window.setTimeout(() => setStep((s) => (s === null ? s : Math.min(s + 1, LAST))), TOUR_STEPS[step].seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const value = useMemo<TourValue>(() => ({ available, active: step !== null, start, stop }), [available, step, start, stop]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {step !== null ? (
        <TourCard
          index={step}
          side={side}
          playing={playing}
          onBack={() => {
            setAuto(false);
            setStep(Math.max(step - 1, 0));
          }}
          onNext={() => {
            setAuto(false);
            setStep(Math.min(step + 1, LAST));
          }}
          onRestart={() => start()}
          onToggleAuto={() => (playing ? setAuto(false) : step < LAST ? setAuto(true) : start(true))}
          onExit={stop}
        />
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

type Side = "left" | "right";

/** Full width on phones; from sm up, a corner card on the side away from the spotlight. */
function cardClass(side: Side): string {
  return `present-hide fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-[560px] rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] sm:bottom-6 sm:mx-0 sm:w-[460px] sm:max-w-none ${
    side === "left" ? "sm:left-6 sm:right-auto" : "sm:left-auto sm:right-6"
  }`;
}

function TourCard({
  index,
  side,
  playing,
  onBack,
  onNext,
  onRestart,
  onToggleAuto,
  onExit,
}: {
  index: number;
  side: Side;
  playing: boolean;
  onBack: () => void;
  onNext: () => void;
  onRestart: () => void;
  onToggleAuto: () => void;
  onExit: () => void;
}) {
  const step = TOUR_STEPS[index];
  const last = index === LAST;
  return (
    <aside aria-label="Guided tour" className={`${cardClass(side)} p-4 sm:p-5`}>
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="shrink-0 text-accent" aria-hidden />
        <p className="eyebrow">
          Guided tour · {index + 1} of {TOUR_STEPS.length}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onToggleAuto} aria-label={playing ? "Pause the tour" : "Play the tour by itself"} title={playing ? "Pause" : "Play by itself"}>
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onExit} aria-label="Close the guided tour" title="Close">
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {TOUR_STEPS.map((_, i) => (
          <span key={i} className={`h-1 flex-1 overflow-hidden rounded-full ${i <= index ? "bg-accent-bg" : "bg-sunken"}`}>
            {playing && i === index + 1 ? <span key={index} className="tour-timer block h-full bg-accent-bg" style={{ animationDuration: `${step.seconds}s` }} /> : null}
          </span>
        ))}
      </div>
      <div aria-live="polite">
        <h2 className="mt-4 font-display text-xl leading-tight sm:text-2xl">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[15px]">{step.body}</p>
      </div>
      <p className="mt-3 flex items-start gap-2 text-sm font-medium text-accent">
        <MousePointerClick size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>{step.hint}</span>
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={index === 0}>
          <ArrowLeft size={16} aria-hidden /> Back
        </button>
        <div className="ml-auto flex gap-2">
          {last ? (
            <>
              <button type="button" className="btn" onClick={onRestart}>
                Start again
              </button>
              <button type="button" className="btn btn-primary" onClick={onExit}>
                Explore on my own
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onNext}>
              Next <ArrowRight size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
