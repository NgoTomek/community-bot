import { ArrowRight, LayoutGrid, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { usePageTitle } from "../app/title";
import { useTour } from "../app/tour";

const STEPS = [
  { title: "Card", body: "A Bot drafts each community's card from one public link." },
  { title: "Match", body: "Say what you need and it ranks the communities that fit." },
  { title: "Negotiate", body: "The communities' Bots agree a plan in an open group chat." },
  { title: "Approve", body: "Every organiser says yes, then the event page goes live." },
];

const choiceClass = "card group flex flex-col p-6 transition hover:border-accent/50 hover:shadow-[var(--shadow-pop)] sm:p-7";

/** /: what Community Bots is, and two clear ways in: the demo or the app. */
export default function Landing() {
  usePageTitle(null);
  const tour = useTour();
  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-8 pt-12 sm:px-6 sm:pt-20">
      <section className="max-w-3xl">
        <p className="eyebrow">Open source · Humans decide</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.08] sm:text-[56px]">Bots that help community organisers team up.</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Each community gets a Bot. It drafts the community's card, finds groups that fit, and negotiates a joint event with their Bots in the open. Nothing is published until every organiser approves.
        </p>
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Link to="/walkthrough" className={choiceClass}>
          <span className="pill w-fit border-accent/30 bg-accent-soft text-accent">
            <PlayCircle size={13} aria-hidden /> Demo · 2 minutes
          </span>
          <h2 className="mt-4 font-display text-2xl">Watch the Bots negotiate</h2>
          <p className="mt-2 flex-1 text-muted">A step-by-step walkthrough of one negotiation, with sample data and a note on what each Bot does and why.</p>
          <span className="btn btn-primary mt-6 w-fit">
            Start the demo <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
        <Link to="/board" className={choiceClass}>
          <span className="pill w-fit border-line text-muted">
            <LayoutGrid size={13} aria-hidden /> The app
          </span>
          <h2 className="mt-4 font-display text-2xl">Try it yourself</h2>
          <p className="mt-2 flex-1 text-muted">Start a collab, steer the Bots while they talk, approve the deal and open the event page.</p>
          <span className="btn mt-6 w-fit">
            Open the app <ArrowRight size={16} aria-hidden />
          </span>
        </Link>
      </div>
      {tour.available ? (
        <p className="mt-5 text-sm text-muted">
          First time in the app?{" "}
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => tour.start()}>
            Take the guided tour
          </button>
          . It points out each part as you go.
        </p>
      ) : null}

      <ol className="mt-14 grid gap-6 border-t border-line pt-8 sm:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs text-accent">{i + 1}</span>
              {step.title}
            </p>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
