import { findEvidenceField, getCardField, highlightQuote, verifyEvidence, type Card } from "@community-bots/core";
import { useState } from "react";

export function quoteFrom(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const quote = (evidence as { quote?: unknown }).quote;
  if (typeof quote !== "string") return null;
  const trimmed = quote.trim();
  return trimmed || null;
}

/** Green tick only when verifyEvidence passes on the card passed in. A stored flag is ignored. */
export function EvidenceMark({ quote, card }: { quote: string | null | undefined; card: Card | undefined }) {
  const [open, setOpen] = useState(false);
  const text = quote?.trim() ? quote.trim() : "";
  if (!text) return null;
  const verified = Boolean(card && verifyEvidence(text, card));
  const field = card ? findEvidenceField(text, card) : null;
  const fieldText = card && field ? getCardField(card, field) : null;
  const segments = fieldText ? highlightQuote(fieldText, text) : null;

  return (
    <div>
      <button
        type="button"
        className={verified ? "evidence ok" : "evidence"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {verified ? (
          <span className="tick" aria-hidden>
            ✓
          </span>
        ) : null}
        Evidence
      </button>
      {open ? (
        <div className="evidence-panel stack">
          {!card ? <p>The card is not loaded, so this quote was not checked.</p> : null}
          {card && !verified ? (
            <>
              <p>This quote is not on the card.</p>
              <p>{text}</p>
            </>
          ) : null}
          {card && verified ? (
            <>
              <p className="kicker">{field ?? "On the card"}</p>
              <p>
                {segments
                  ? segments.map((segment, index) =>
                      segment.highlight ? (
                        <mark key={index} className="quote">
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={index}>{segment.text}</span>
                      ),
                    )
                  : text}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
