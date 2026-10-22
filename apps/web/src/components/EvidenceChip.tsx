import type { Card } from "@community-bots/core";
import { CircleAlert, CircleCheck, CircleDashed, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { checkQuote } from "../lib/evidence";
import { Popover } from "./ui/Popover";

/** "offers[1]" -> "Offers, item 2"; "constraints.notes" -> "Constraints, notes". */
export function fieldLabel(path: string | null): string {
  if (!path) return "";
  return path
    .replace(/\[(\d+)\]/g, (_, n) => `, item ${Number(n) + 1}`)
    .split(".")
    .map((part, i) => (i === 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(", ")
    .replace(/maxGroupSize/, "max group size")
    .replace(/sourceUrls/, "source links");
}

/**
 * The evidence chip on every Bot claim. Verification is recomputed here from the cards with
 * verifyEvidence; whatever flag the database stored is ignored.
 */
export function EvidenceChip({
  quote,
  preferredId,
  cards,
  names,
}: {
  quote: string | null | undefined;
  preferredId: string | null;
  cards: Record<string, Card | undefined>;
  names: Record<string, string>;
}) {
  const result = checkQuote(quote, preferredId, cards);

  if (result.status === "none") {
    return (
      <span className="pill border-line text-faint" title="This post makes no claim from a card">
        <CircleDashed size={12} aria-hidden />
        No card quote
      </span>
    );
  }

  const owner = result.ownerId ? (names[result.ownerId] ?? result.ownerId) : null;
  const verified = result.status === "verified";
  const label = verified ? (owner && result.ownerId !== preferredId ? `On ${owner}'s card` : "On the card") : result.status === "no-card" ? "Card not loaded" : "Not on any card";
  const cls = verified ? "border-ok/30 bg-ok-soft text-ok" : result.status === "no-card" ? "border-line text-muted" : "border-bad/30 bg-bad-soft text-bad";
  const Icon = verified ? CircleCheck : CircleAlert;

  return (
    <Popover
      label="Evidence"
      width={360}
      trigger={(props) => (
        <button type="button" {...props} className={`pill cursor-pointer ${cls} hover:brightness-95`} aria-label={`Evidence: ${label}. Show the quote`}>
          <Icon size={12} aria-hidden />
          {label}
        </button>
      )}
    >
      {() => (
        <div className="space-y-3">
          {verified ? (
            <>
              <p className="eyebrow">
                {owner}'s card · {fieldLabel(result.field)}
              </p>
              <p className="leading-relaxed">
                {result.segments.map((s, i) =>
                  s.highlight ? (
                    <mark key={i} className="quote">
                      {s.text}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">{result.status === "no-card" ? "Card not loaded" : "Not found"}</p>
              <p className="leading-relaxed">“{result.quote}”</p>
              <p className="text-sm text-muted">
                {result.status === "no-card" ? "The card for this community has not loaded, so the quote cannot be checked yet." : "This quote does not appear on any card in this collab. Treat the claim with care."}
              </p>
            </>
          )}
          <p className="text-xs text-faint">Checked in your browser against the card. Stored flags are ignored.</p>
          {verified && result.ownerId ? (
            <Link to={`/c/${result.ownerId}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Open {owner}'s card <ExternalLink size={13} aria-hidden />
            </Link>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
