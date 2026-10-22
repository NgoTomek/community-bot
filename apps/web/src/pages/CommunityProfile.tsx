import { BadgeCheck, Clock, Handshake, Loader2, MapPin, PenLine, Pencil, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useIdentity } from "../app/identity";
import { usePresenter } from "../app/presenter";
import { usePageTitle } from "../app/title";
import { Avatar, AvatarStack } from "../components/Avatar";
import { DraftBadge, RunStatusPill, SampleBadge, YouTag } from "../components/Badges";
import { ConfirmDialog } from "../components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "../components/ui/States";
import { useToast } from "../components/ui/Toast";
import { Tooltip, useGate } from "../components/ui/Tooltip";
import { useData } from "../data/DataProvider";
import { errorText, useCommunities, useCommunity, useNow, useRuns } from "../data/hooks";
import type { Community, Run } from "../data/types";
import { CardEditor, GuessLegend, StickyBar, useCardDraft } from "../features/card/CardEditor";
import { cardGuessCount } from "../features/card/cardForm";
import { CardView, GuessText } from "../features/card/CardView";
import { TryIt } from "../features/card/TryIt";
import { useNewRequest } from "../features/request/NewRequest";
import { joinNames, plural, relativeTime } from "../lib/format";

const PAGE = "mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-12";

function ProfileSkeleton() {
  return (
    <div className={PAGE} aria-busy="true">
      <span className="sr-only">Loading community</span>
      <div className="flex items-start gap-4 sm:gap-5">
        <Skeleton className="size-16 shrink-0 rounded-full!" />
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}

function ConfirmedPill() {
  return (
    <span className="pill bg-ok-soft text-ok" title="The community checked and confirmed this card.">
      <BadgeCheck size={13} aria-hidden />
      Confirmed card
    </span>
  );
}

function CollabRow({ run, communityId, names }: { run: Run; communityId: string; names: Record<string, string> }) {
  const others = [run.leadId, ...run.partnerIds].filter((id) => id !== communityId).map((id) => ({ id, name: names[id] ?? id }));
  return (
    <li>
      <Link to={`/run/${run.id}`} className="block px-4 py-3.5 transition-colors hover:bg-surface-2">
        <span className="flex flex-wrap items-center gap-2">
          <RunStatusPill run={run} />
          <span className="text-xs text-faint">
            {run.leadId === communityId ? "Leading" : "Partner"} · {relativeTime(run.createdAt)}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 block text-sm leading-relaxed">{run.need}</span>
        {others.length ? (
          <span className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted">
            <AvatarStack items={others} size={20} />
            <span className="truncate">with {joinNames(others.map((o) => o.name))}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Collabs({ community }: { community: Community }) {
  const runs = useRuns();
  const communities = useCommunities();
  const { open } = useNewRequest();
  useNow(60_000);
  const names = useMemo(() => Object.fromEntries((communities.data ?? []).map((c) => [c.id, c.name])), [communities.data]);
  const mine = (runs.data ?? []).filter((r) => r.leadId === community.id || r.partnerIds.includes(community.id));

  return (
    <section aria-labelledby="collabs-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="collabs-title" className="eyebrow">
          Collabs
        </h2>
        {mine.length ? <span className="text-xs tabular text-faint">{mine.length}</span> : null}
      </div>
      <div className="mt-3">
        {runs.loading ? (
          <SkeletonCard lines={2} />
        ) : runs.error && !runs.data ? (
          <ErrorState title="Could not load collabs" message={runs.error} onRetry={runs.reload} />
        ) : mine.length === 0 ? (
          <div className="card">
            <EmptyState
              compact
              icon={<Handshake size={22} aria-hidden />}
              title="No collabs yet"
              body={`When ${community.name} leads or joins a collab, it shows up here.`}
              action={
                <button type="button" className="btn btn-sm" onClick={() => open({ leadId: community.id })}>
                  Start a collab request
                </button>
              }
            />
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {mine.map((run) => (
              <CollabRow key={run.id} run={run} communityId={community.id} names={names} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EditCard({ community, onClose }: { community: Community; onClose: (saved: boolean) => void }) {
  const source = useData();
  const toast = useToast();
  const { ensurePasscode } = usePresenter();
  const editor = useCardDraft(community.card, community.id);
  const gate = useGate("save_card");
  const [hadGuesses] = useState(() => cardGuessCount(community.card) > 0);
  const isDraft = community.status === "draft";
  const [alsoConfirm, setAlsoConfirm] = useState(false);
  const [dialog, setDialog] = useState<"save" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = isDraft && !alsoConfirm ? "draft" : "confirmed";
  const changed = editor.dirty || status !== community.status;
  const errorCount = Object.keys(editor.errors).length + (editor.other ? 1 : 0);

  const save = async () => {
    setDialog(null);
    if (!editor.valid) return;
    const passcode = await ensurePasscode("Saving changes to a card needs the organiser passcode.");
    if (passcode === false) return;
    setSaving(true);
    setError(null);
    try {
      await source.saveCard(passcode, editor.card, status);
      toast({ title: "Card saved", body: "The Bots will use the new card from the next negotiation.", tone: "ok" });
      onClose(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="edit-title">
      <h2 id="edit-title" className="font-display text-2xl sm:text-3xl">
        Edit card
      </h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted">Fix anything that is out of date. The profile link stays the same.</p>
      {hadGuesses ? (
        <div className="mt-4">
          <GuessLegend count={editor.guesses} />
        </div>
      ) : null}
      <div className="mt-6">
        <CardEditor editor={editor} />
      </div>
      {error ? (
        <div className="mt-6">
          <ErrorState title="Changes not saved" message={error} onRetry={() => setDialog("save")} />
        </div>
      ) : null}
      {editor.other ? <p className="mt-4 text-sm text-bad">{editor.other}</p> : null}
      <StickyBar>
        <p className={`mr-auto text-sm ${editor.valid ? "text-muted" : "text-bad"}`} aria-live="polite">
          {!editor.valid ? `Fix ${plural(errorCount, "field")} to save.` : changed ? "You have unsaved changes." : "No changes yet."}
        </p>
        {isDraft ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent-bg)]" checked={alsoConfirm} onChange={(e) => setAlsoConfirm(e.target.checked)} />
            Also mark as confirmed
          </label>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={() => (changed ? setDialog("discard") : onClose(false))}>
          Cancel
        </button>
        <Tooltip label={gate.reason} focusable={gate.disabled}>
          <button type="button" className="btn btn-primary" disabled={!editor.valid || !changed || saving || gate.disabled} onClick={() => setDialog("save")}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Save changes
          </button>
        </Tooltip>
      </StickyBar>
      <ConfirmDialog
        open={dialog === "save"}
        onClose={() => setDialog(null)}
        onConfirm={() => void save()}
        title={`Save changes to ${community.name}?`}
        body={
          <>
            The Bots will use the new card from the next negotiation.
            {status !== community.status ? " The card will also be marked as confirmed." : ""}
          </>
        }
        confirmLabel="Save changes"
        busy={saving}
      />
      <ConfirmDialog
        open={dialog === "discard"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          onClose(false);
        }}
        title="Discard your changes?"
        body="The card stays as it was."
        confirmLabel="Discard changes"
        destructive
      />
    </section>
  );
}

function Profile({ id }: { id: string }) {
  const source = useData();
  const community = useCommunity(id);
  const { communityIds } = useIdentity();
  const { open } = useNewRequest();
  const [editing, setEditing] = useState(false);
  const c = community.data;
  usePageTitle(c ? c.name : c === null ? "Community not found" : null);

  if (community.loading) return <ProfileSkeleton />;

  if (!c) {
    if (community.error && community.errorCode !== "not_found") {
      return (
        <div className={PAGE}>
          <ErrorState title="Could not load this community" message={community.error} onRetry={community.reload} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <p className="eyebrow">Not found</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">No community at this link</h1>
        <p className="mt-3 text-muted">The link may be old, or the community was removed.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            Go to the board
          </Link>
          <Link to="/add" className="btn">
            Add a community
          </Link>
        </div>
      </div>
    );
  }

  const card = c.card;
  const guesses = cardGuessCount(card);
  return (
    <div className={PAGE}>
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <Avatar id={c.id} name={c.name} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "confirmed" ? <ConfirmedPill /> : <DraftBadge />}
              {communityIds.includes(c.id) ? <YouTag /> : null}
              {source.kind === "mock" ? <SampleBadge /> : null}
            </div>
            <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{c.name}</h1>
            {card.tagline ? (
              <p className="mt-2 max-w-2xl text-lg leading-relaxed text-muted">
                <GuessText value={card.tagline} />
              </p>
            ) : null}
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {card.location ? (
                <li className="flex items-center gap-1.5">
                  <MapPin size={15} className="shrink-0 text-faint" aria-hidden />
                  <span className="sr-only">Location: </span>
                  <span>
                    <GuessText value={card.location} />
                  </span>
                </li>
              ) : null}
              {card.members ? (
                <li className="flex items-center gap-1.5">
                  <Users size={15} className="shrink-0 text-faint" aria-hidden />
                  <span className="sr-only">Members: </span>
                  <span>
                    <GuessText value={card.members} />
                  </span>
                </li>
              ) : null}
              <li className="flex items-center gap-1.5">
                <Clock size={15} className="shrink-0 text-faint" aria-hidden />
                Updated {relativeTime(c.updatedAt)}
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0">
          <button type="button" className="btn btn-primary" onClick={() => open({ leadId: c.id })}>
            <Sparkles size={16} aria-hidden />
            Start a collab request
          </button>
          {!editing ? (
            <button type="button" className="btn admin-only" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden />
              Edit card
            </button>
          ) : null}
        </div>
      </header>

      {c.status === "draft" && !editing ? (
        <p className="mt-6 flex max-w-3xl items-start gap-2.5 rounded-xl bg-sunken px-4 py-3 text-sm leading-relaxed text-muted">
          <PenLine size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            A Bot drafted this card from public pages and {c.name} has not confirmed it yet.
            {guesses ? ` ${plural(guesses, "field is a guess", "fields are guesses")}, highlighted below.` : ""}
          </span>
        </p>
      ) : null}

      {editing ? (
        <div className="mt-10">
          <EditCard
            community={c}
            onClose={(saved) => {
              setEditing(false);
              if (saved) community.reload();
            }}
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <CardView card={card} />
          </div>
          <aside className="min-w-0">
            <Collabs community={c} />
          </aside>
        </div>
      )}

      <TryIt community={c} />
    </div>
  );
}

export default function CommunityProfile() {
  const { id = "" } = useParams();
  return <Profile key={id} id={id} />;
}
