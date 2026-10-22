import { useEffect, useRef, useState } from "react";
import { CopyButton } from "./ui";
import { DealCard } from "./DealCard";
import { Transcript } from "./Chat";
import type { ReplayData } from "./replay";

export function ReplayPlayer({ data }: { data: ReplayData }) {
  const [cursor, setCursor] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const messagesRef = useRef(data.messages);
  messagesRef.current = data.messages;
  const total = data.messages.length;
  const finished = cursor >= total;

  useEffect(() => {
    setCursor(0);
    setPaused(false);
  }, [data.id]);

  useEffect(() => {
    if (paused || cursor >= messagesRef.current.length) return;
    const wait = Math.max(0, (messagesRef.current[cursor]?.delayMs ?? 0) / speed);
    const timer = window.setTimeout(() => setCursor((value) => value + 1), wait);
    return () => window.clearTimeout(timer);
  }, [paused, cursor, speed, total]);

  const shown = data.messages.slice(0, cursor);

  return (
    <div className="stack-lg">
      <div className="player row" role="group" aria-label="Replay controls">
        <button type="button" className="btn-quiet" onClick={() => setPaused((value) => !value)} aria-pressed={paused} disabled={total === 0}>
          {paused ? "Play" : "Pause"}
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => setCursor((value) => Math.min(messagesRef.current.length, value + 1))}
          disabled={finished}
        >
          Skip
        </button>
        {([1, 2, 4] as const).map((value) => (
          <button key={value} type="button" className="btn-quiet" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
            {value}x
          </button>
        ))}
        <p className="muted">
          {cursor} of {total}
        </p>
      </div>
      {data.need ? (
        <blockquote>
          <p>{data.need}</p>
        </blockquote>
      ) : null}
      {total === 0 ? <p>This run has no messages.</p> : <Transcript messages={shown} cards={data.cards} names={data.names} />}
      {finished && data.dealProblem ? <p className="bad">{data.dealProblem}</p> : null}
      {finished && data.deal ? <DealCard deal={data.deal} cards={data.cards} /> : null}
      {finished && data.announcements.length > 0 ? (
        <section className="stack">
          <h2>Announcements</h2>
          {data.announcements.map((announcement) => (
            <article key={announcement.communityId} className="stack">
              <h3>{data.names[announcement.communityId] || announcement.communityId}</h3>
              <p>{announcement.text}</p>
              <CopyButton text={announcement.text} label="Copy" />
            </article>
          ))}
        </section>
      ) : null}
      {finished && data.recorded.length > 0 ? (
        <section className="stack">
          <h2>Recorded responses</h2>
          <ul>
            {data.recorded.map((row) => (
              <li key={row.name}>
                {row.name}: {row.status}
                {row.note ? ` — ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
