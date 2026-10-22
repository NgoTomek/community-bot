import { isGuess, type Card } from "@community-bots/core";
import { CalendarDays, ExternalLink, Gift, HandHelping, MessageCircle, Repeat, Users } from "lucide-react";
import type { ReactNode } from "react";
import { DAY_NAMES } from "../../lib/constraints";
import { joinNames } from "../../lib/format";
import { linkLabel, safeHref, stripGuess } from "./cardForm";

/** The small "Guess" marker next to anything the Bot inferred. */
export function GuessMark({ id }: { id?: string }) {
  return (
    <span id={id} className="pill bg-guess text-ink" title="The Bot guessed this from public info. Nobody has checked it yet.">
      Guess
    </span>
  );
}

/** Card text with the GUESS prefix turned into a highlight and a marker. */
export function GuessText({ value }: { value: string }) {
  if (!isGuess(value)) return <>{value}</>;
  return (
    <>
      <span className="guess px-0.5">{stripGuess(value)}</span>
      <span className="ml-2 inline-flex align-middle">
        <GuessMark />
      </span>
    </>
  );
}

export function SourceLinks({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <p className="text-sm text-muted">No source links listed.</p>;
  return (
    <ul className="space-y-1.5">
      {urls.map((url, i) => {
        const href = safeHref(url);
        return (
          <li key={`${url}:${i}`} className="min-w-0 text-sm">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-accent hover:underline">
                <span className="truncate">{linkLabel(url)}</span>
                <ExternalLink size={13} className="shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <span className="break-all text-muted">{url}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, icon, children, className = "" }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <h2 className="eyebrow flex items-center gap-2">
        <span className="text-faint">{icon}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Items({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={`${item}:${i}`} className="flex gap-3 leading-relaxed">
          <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <span className="min-w-0">
            <GuessText value={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Read-only card sections for a community profile. */
export function CardView({ card }: { card: Card }) {
  const { days, maxGroupSize, notes } = card.constraints;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
      <Section title="Offers" icon={<Gift size={14} aria-hidden />}>
        <Items items={card.offers} empty="No offers listed yet." />
      </Section>
      <Section title="Needs" icon={<HandHelping size={14} aria-hidden />}>
        <Items items={card.needs} empty="No needs listed yet." />
      </Section>
      <Section title="Runs" icon={<Repeat size={14} aria-hidden />}>
        {card.runs.length === 0 ? (
          <p className="text-sm text-muted">No regular events listed.</p>
        ) : (
          <ul className="space-y-3">
            {card.runs.map((run, i) => (
              <li key={`${run.event}:${i}`} className="leading-relaxed">
                <p className="font-medium">
                  <GuessText value={run.event} />
                </p>
                {run.frequency ? (
                  <p className="text-sm text-muted">
                    <GuessText value={run.frequency} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Constraints" icon={<CalendarDays size={14} aria-hidden />}>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted">Days</dt>
            <dd className="mt-1.5">
              {days.length ? (
                <>
                  <span className="flex flex-wrap gap-1.5" aria-hidden>
                    {days.map((d) => (
                      <span key={d} className="pill bg-accent-soft text-accent" title={DAY_NAMES[d]}>
                        {d}
                      </span>
                    ))}
                  </span>
                  <span className="sr-only">{joinNames(days.map((d) => DAY_NAMES[d]))}</span>
                </>
              ) : (
                <span className="text-sm">No day limits listed</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Max group size</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
              <Users size={14} className="text-faint" aria-hidden />
              {maxGroupSize !== null ? <span className="tabular">Up to {maxGroupSize} people</span> : "No size limit listed"}
            </dd>
          </div>
          {notes ? (
            <div>
              <dt className="text-sm text-muted">Notes</dt>
              <dd className="mt-0.5 text-sm leading-relaxed">
                <GuessText value={notes} />
              </dd>
            </div>
          ) : null}
        </dl>
      </Section>
      <Section title="Tone" icon={<MessageCircle size={14} aria-hidden />}>
        {card.tone ? (
          <p className="leading-relaxed">
            <GuessText value={card.tone} />
          </p>
        ) : (
          <p className="text-sm text-muted">No tone listed.</p>
        )}
      </Section>
      <Section title="Sources" icon={<ExternalLink size={14} aria-hidden />}>
        <SourceLinks urls={card.sourceUrls} />
      </Section>
    </div>
  );
}
