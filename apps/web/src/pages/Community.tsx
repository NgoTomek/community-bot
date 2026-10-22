import { relativeTime } from "../lib/format";
import { getCommunity } from "../product/api";
import { CardView } from "../product/CardView";
import { AppLink } from "../product/session";
import { supabaseConfigured } from "../product/supabase";
import { useLiveQuery } from "../product/useLive";
import { isCommunityId } from "../product/url";
import { EmptyState, ErrorBanner, Loading, SetupNotice, StatusBadge, useTitle } from "../product/ui";
import { useParams } from "react-router-dom";

export default function Community() {
  const { id } = useParams();
  const valid = isCommunityId(id);
  useTitle(id ?? "Community");
  const query = useLiveQuery({
    enabled: supabaseConfigured && valid,
    key: `community:${id ?? "none"}`,
    load: () => getCommunity(id as string),
  });
  const community = query.data;

  return (
    <div className="page stack-lg">
      {!valid ? (
        <EmptyState title="This address is not a community id">
          <AppLink className="btn-quiet" to="/">
            Directory
          </AppLink>
        </EmptyState>
      ) : null}
      {valid && !supabaseConfigured ? <SetupNotice /> : null}
      {valid && supabaseConfigured && query.loading && community === undefined ? <Loading label="Loading the card" /> : null}
      <ErrorBanner message={query.error} />
      {valid && supabaseConfigured && community === null && !query.loading && !query.error ? (
        <EmptyState title="This community is not on the board">
          <AppLink className="btn-quiet" to="/">
            Directory
          </AppLink>
        </EmptyState>
      ) : null}
      {community ? (
        <>
          <header className="stack">
            <p className="kicker">Community</p>
            <StatusBadge status={community.status} />
            <h1>{community.name}</h1>
            {community.updatedAt ? <p className="muted">Updated {relativeTime(community.updatedAt)}</p> : null}
            <AppLink className="btn-signal" to={`/c/${community.id}/request`}>
              Start a collab request
            </AppLink>
          </header>
          {community.card ? (
            <CardView card={community.card} sourceUrls={community.sourceUrls} />
          ) : (
            <EmptyState title="This card could not be read">
              <p>The row is on the board, but its card JSON did not match a community card.</p>
            </EmptyState>
          )}
        </>
      ) : null}
    </div>
  );
}
