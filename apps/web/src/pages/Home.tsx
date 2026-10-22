import { useEffect } from "react";
import { relativeTime } from "../lib/format";
import { listCommunities } from "../product/api";
import { Fact } from "../product/CardView";
import { AppLink } from "../product/session";
import { supabaseConfigured } from "../product/supabase";
import { useLiveQuery } from "../product/useLive";
import { EmptyState, ErrorBanner, Loading, SetupNotice, StatusBadge, useTitle } from "../product/ui";

export default function Home() {
  useTitle("Directory");
  const query = useLiveQuery({
    enabled: supabaseConfigured,
    key: "communities",
    load: listCommunities,
  });

  useEffect(() => {
    const onFocus = () => query.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [query.refresh]);

  return (
    <div className="page stack-lg">
      <header className="stack">
        <p className="kicker">Directory</p>
        <h1>Communities</h1>
        <p>Cards drafted from public pages. An organiser confirms a card before it is treated as fact.</p>
        <AppLink className="btn-signal" to="/add">
          Add your community
        </AppLink>
      </header>
      {!supabaseConfigured ? <SetupNotice /> : null}
      {supabaseConfigured && query.loading && !query.data ? <Loading label="Loading the directory" /> : null}
      {supabaseConfigured ? <ErrorBanner message={query.error} /> : null}
      {query.error ? (
        <button type="button" className="btn-quiet" onClick={query.refresh}>
          Try again
        </button>
      ) : null}
      {supabaseConfigured && query.data && query.data.length === 0 ? (
        <EmptyState title="The board is empty">
          <p>No communities are on the board yet.</p>
        </EmptyState>
      ) : null}
      {query.data && query.data.length > 0 ? (
        <ul className="directory">
          {query.data.map((community, index) => {
            const offers = community.card?.offers.slice(0, 2) ?? [];
            return (
              <li key={community.id} className={index === 0 ? "lead" : undefined}>
                <article className="clipping stack" data-status={community.status === "confirmed" || community.status === "draft" ? community.status : undefined}>
                  <StatusBadge status={community.status} />
                  <h2>
                    <AppLink to={`/c/${community.id}`}>{community.name}</AppLink>
                  </h2>
                  {community.card?.tagline ? (
                    <p className="dek">
                      <Fact value={community.card.tagline} />
                    </p>
                  ) : null}
                  {community.card?.location ? (
                    <p>
                      <Fact value={community.card.location} />
                    </p>
                  ) : null}
                  {!community.card ? <p className="muted">This card could not be read.</p> : null}
                  {offers.length > 0 ? (
                    <div>
                      <p className="kicker">Offers</p>
                      <ul>
                        {offers.map((offer, offerIndex) => (
                          <li key={`${offer}-${offerIndex}`}>
                            <Fact value={offer} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {community.updatedAt ? <p className="muted">Updated {relativeTime(community.updatedAt)}</p> : null}
                  <AppLink className="btn-quiet" to={`/c/${community.id}`}>
                    Read the card
                  </AppLink>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
