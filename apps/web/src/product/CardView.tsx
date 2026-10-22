import { isGuess, type Card } from "@community-bots/core";
import { listDays } from "../lib/constraints";
import { SafeLink } from "./ui";

export function Fact({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">Not on the card</span>;
  if (isGuess(value)) return <span className="guess-text">{value}</span>;
  return <>{value}</>;
}

function Items({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="muted">None on the card</p>;
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>
          <Fact value={item} />
        </li>
      ))}
    </ul>
  );
}

export function CardView({ card, sourceUrls }: { card: Card; sourceUrls?: string[] }) {
  const sources = [...new Set([...(sourceUrls ?? []), ...card.sourceUrls])];
  return (
    <div className="stack-lg">
      <p className="dek">
        <Fact value={card.tagline} />
      </p>
      <dl className="stack">
        <div>
          <dt className="kicker">Location</dt>
          <dd>
            <Fact value={card.location} />
          </dd>
        </div>
        <div>
          <dt className="kicker">Members</dt>
          <dd>
            <Fact value={card.members} />
          </dd>
        </div>
        <div>
          <dt className="kicker">Tone</dt>
          <dd>
            <Fact value={card.tone} />
          </dd>
        </div>
      </dl>
      <section className="stack">
        <h2>Runs</h2>
        {card.runs.length === 0 ? (
          <p className="muted">None on the card</p>
        ) : (
          <ul>
            {card.runs.map((run, index) => (
              <li key={`${run.event}-${index}`}>
                <Fact value={run.event} />
                {run.frequency ? (
                  <>
                    {" "}
                    · <Fact value={run.frequency} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack">
        <h2>Offers</h2>
        <Items items={card.offers} />
      </section>
      <section className="stack">
        <h2>Needs</h2>
        <Items items={card.needs} />
      </section>
      <section className="stack">
        <h2>Constraints</h2>
        <p>Days: {card.constraints.days.length ? listDays(card.constraints.days) : "Not on the card"}</p>
        <p>Max group size: {card.constraints.maxGroupSize ?? "Not on the card"}</p>
        <p>
          Notes: <Fact value={card.constraints.notes} />
        </p>
      </section>
      <section className="stack">
        <h2>Sources</h2>
        {sources.length === 0 ? (
          <p className="muted">None on the card</p>
        ) : (
          <ul>
            {sources.map((url) => (
              <li key={url}>
                <SafeLink href={url} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
