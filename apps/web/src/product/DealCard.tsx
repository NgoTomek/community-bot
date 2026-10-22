import type { Card, Deal } from "@community-bots/core";
import { checkDealConstraints } from "../lib/constraints";
import { longDate } from "../lib/format";
import { AppLink } from "./session";
import { EvidenceMark } from "./EvidenceMark";
import { Fact } from "./CardView";

export function DealCard({
  deal,
  cards,
}: {
  deal: Deal;
  cards?: Record<string, Card | undefined>;
}) {
  const checks = cards ? checkDealConstraints(deal, cards) : [];
  return (
    <article className="programme stack-lg">
      <header className="stack">
        <h2>{deal.title}</h2>
        <p>
          {longDate(deal.date)} · {deal.time} · {deal.venue}
        </p>
        <p>Capacity {deal.capacity}</p>
        <p className="dek">{deal.description}</p>
      </header>
      <section className="stack">
        <h3>Hosted by</h3>
        <div className="row">
          {deal.communities.map((community) => (
            <AppLink key={community.id} className="chip" to={`/c/${community.id}`}>
              {community.name}
            </AppLink>
          ))}
        </div>
      </section>
      <section className="stack">
        <h3>What each community brings</h3>
        {deal.communities.map((community) => (
          <div key={community.id} className="stack">
            <p>
              <strong>{community.name}</strong> · {community.role}
            </p>
            {community.brings.length === 0 ? (
              <p className="muted">Nothing listed on the deal</p>
            ) : (
              <ul>
                {community.brings.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <Fact value={item} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
      <section className="stack">
        <h3>Agenda</h3>
        <div className="agenda">
          {deal.agenda.map((item, index) => (
            <div key={`${item.time}-${index}`} style={{ display: "contents" }}>
              <div className="when">{item.time}</div>
              <div>{item.item}</div>
            </div>
          ))}
        </div>
      </section>
      {deal.reasons.length > 0 ? (
        <section className="stack">
          <h3>Evidence on the deal</h3>
          {deal.reasons.map((reason, index) => (
            <blockquote key={`${reason.communityId}-${index}`} className="stack">
              <p>{reason.evidence}</p>
              <EvidenceMark quote={reason.evidence} card={cards?.[reason.communityId]} />
            </blockquote>
          ))}
        </section>
      ) : null}
      {checks.length > 0 ? (
        <section className="stack">
          <h3>Checked against the cards</h3>
          <ul>
            {checks.map((check) => (
              <li key={check.id} className={check.ok ? (check.unknown ? "muted" : "ok") : "bad"}>
                {check.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
