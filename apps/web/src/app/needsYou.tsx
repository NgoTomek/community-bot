import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useToast } from "../components/ui/Toast";
import { useData } from "../data/DataProvider";
import { useLive, useRuns } from "../data/hooks";
import type { RequestSummary } from "../data/types";
import { useIdentity } from "./identity";
import { usePresenter } from "./presenter";
import { setTitleBadge } from "./title";

interface NeedsYouValue {
  /** Pending requests for the active organiser, or for everyone in presenter mode. */
  pending: RequestSummary[];
  /** Every request for the active organiser (any status). */
  mine: RequestSummary[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const NeedsYouContext = createContext<NeedsYouValue | null>(null);

export function NeedsYouProvider({ children }: { children: ReactNode }) {
  const source = useData();
  const toast = useToast();
  const { active } = useIdentity();
  const { passcode } = usePresenter();
  const runs = useRuns();

  const mine = useLive(
    active ? `requests:${active.inbox}` : null,
    async () => {
      const list = await source.listRequests(active!.inbox);
      return list.map((r) => ({ ...r, communityId: r.communityId ?? active!.communityId ?? undefined, communityName: r.communityName ?? active!.name ?? undefined }));
    },
    { topics: ["approvals"], poll: "always", intervalMs: 3000 },
  );

  const waitingRuns = (runs.data ?? []).filter((r) => r.status === "pending_approval" && r.dealId);
  const presenterKey = passcode && waitingRuns.length ? `presenter-all:${waitingRuns.map((r) => `${r.id}:${r.dealId}`).join(",")}` : null;
  const everyone = useLive(
    presenterKey,
    async () => {
      const out: RequestSummary[] = [];
      for (const run of waitingRuns) {
        const [rows, deal] = await Promise.all([source.presenterStatus(passcode!, run.id), source.getDeal(run.dealId!)]);
        for (const row of rows) {
          out.push({
            token: row.token,
            status: row.status,
            round: row.round,
            dealId: run.dealId!,
            title: deal?.deal.title ?? run.need,
            date: deal?.deal.date ?? "",
            updatedAt: run.createdAt,
            runId: run.id,
            communityId: row.communityId,
            communityName: row.name,
          });
        }
      }
      return out;
    },
    { topics: ["approvals"], poll: "always", intervalMs: 3000 },
  );

  const pending = useMemo(() => {
    const list = passcode ? (everyone.data ?? []) : (mine.data ?? []);
    return list.filter((r) => r.status === "pending");
  }, [passcode, everyone.data, mine.data]);

  // Title badge, plus a toast when something new needs a decision.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    setTitleBadge(pending.length);
    const ready = passcode ? everyone.data !== undefined : mine.data !== undefined;
    if (!ready) return;
    const keys = new Set(pending.map((r) => `${r.token}:${r.round}`));
    if (seen.current) {
      const fresh = pending.filter((r) => !seen.current!.has(`${r.token}:${r.round}`));
      if (fresh.length === 1) {
        const r = fresh[0];
        toast({
          title: r.round > 1 ? `Round ${r.round} needs your decision` : "A collab needs your decision",
          body: `${r.title}${r.communityName && passcode ? ` (for ${r.communityName})` : ""}`,
          action: r.runId ? { label: "Open the thread", to: `/run/${r.runId}` } : undefined,
          duration: 8000,
        });
      } else if (fresh.length > 1) {
        toast({ title: `${fresh.length} collabs need a decision`, action: { label: "Open the board", to: "/" }, duration: 8000 });
      }
    }
    seen.current = keys;
  }, [pending, passcode, everyone.data, mine.data, toast]);

  const value = useMemo<NeedsYouValue>(
    () => ({
      pending,
      mine: mine.data ?? [],
      loading: passcode ? everyone.loading : mine.loading,
      error: passcode ? everyone.error : mine.error,
      reload: () => {
        mine.reload();
        everyone.reload();
      },
    }),
    [pending, mine, everyone, passcode],
  );

  return <NeedsYouContext.Provider value={value}>{children}</NeedsYouContext.Provider>;
}

export function useNeedsYou(): NeedsYouValue {
  const ctx = useContext(NeedsYouContext);
  if (!ctx) throw new Error("useNeedsYou must be used inside NeedsYouProvider");
  return ctx;
}
