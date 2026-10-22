import { communityColor, initials } from "../lib/color";
import type { LiveMessage } from "./api";
import { EvidenceMark, quoteFrom } from "./EvidenceMark";
import type { Card } from "@community-bots/core";

export function Avatar({ id, name }: { id: string; name: string }) {
  return (
    <span className="avatar" style={{ background: communityColor(id || name) }} aria-hidden>
      {initials(name || id || "?")}
    </span>
  );
}

export function Transcript({
  messages,
  cards,
  names,
  typingId,
}: {
  messages: LiveMessage[];
  cards: Record<string, Card | undefined>;
  names: Record<string, string>;
  typingId?: string | null;
}) {
  return (
    <div className="transcript" role="log" aria-live="polite" aria-relevant="additions">
      {messages.map((message) => {
        const name = names[message.communityId] || message.speaker || message.communityId || "Speaker";
        return (
          <article key={message.id} className="msg">
            <Avatar id={message.communityId || message.speaker || message.id} name={name} />
            <div className="stack">
              <p>
                <strong>{message.speaker || name}</strong>
                {message.stance ? <span className="kicker"> · {message.stance}</span> : null}
              </p>
              <p className="body">{message.text}</p>
              {message.role === "bot" ? (
                <EvidenceMark quote={quoteFrom(message.evidence)} card={cards[message.communityId]} />
              ) : null}
            </div>
          </article>
        );
      })}
      {typingId ? (
        <div className="msg">
          <Avatar id={typingId} name={names[typingId] || typingId} />
          <p>
            {names[typingId] || typingId}{" "}
            <span className="typing-dots" aria-label="Typing">
              <span />
              <span />
              <span />
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
