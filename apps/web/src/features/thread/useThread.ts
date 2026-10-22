import type { Card } from "@community-bots/core";
import { useMemo } from "react";
import { useIdentity } from "../../app/identity";
import { useNeedsYou } from "../../app/needsYou";
import { usePresenter } from "../../app/presenter";
import { useCommunities, useDeals, useMessages, usePresenterStatus, useRequestDetail, useRun } from "../../data/hooks";
import type { ApprovalView, Community } from "../../data/types";
import { buildTimeline } from "../../lib/timeline";

/**
 * Everything the thread screen shows. Approvals are never read directly: the viewer sees them
 * through presenter_status (presenter mode) or get_request (their own organiser link).
 */
export function useThread(runId: string | undefined) {
  const run = useRun(runId);
  const messages = useMessages(runId);
  const deals = useDeals(runId);
  const communities = useCommunities();
  const { passcode } = usePresenter();
  const { active, identities } = useIdentity();
  const { mine } = useNeedsYou();

  const presenter = usePresenterStatus(passcode, run.data ? runId : undefined);
  const myRequest = useMemo(() => {
    if (!runId) return null;
    const dealIds = new Set((deals.data ?? []).map((d) => d.id));
    const matches = mine.filter((r) => r.runId === runId || dealIds.has(r.dealId));
    return matches.sort((a, b) => b.round - a.round)[0] ?? null;
  }, [mine, runId, deals.data]);
  const myDetail = useRequestDetail(myRequest?.token);

  const byId = useMemo(() => {
    const map: Record<string, Community> = {};
    for (const c of communities.data ?? []) map[c.id] = c;
    return map;
  }, [communities.data]);
  const cards = useMemo(() => {
    const map: Record<string, Card | undefined> = {};
    for (const c of communities.data ?? []) map[c.id] = c.card;
    return map;
  }, [communities.data]);
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of communities.data ?? []) map[c.id] = c.name;
    for (const d of deals.data ?? []) for (const c of d.deal.communities) map[c.id] ??= c.name;
    return map;
  }, [communities.data, deals.data]);

  const approvals = useMemo<ApprovalView[]>(() => {
    if (presenter.data) {
      return presenter.data.map((row) => ({
        communityId: row.communityId,
        name: row.name,
        status: row.status,
        note: row.note,
        round: row.round,
        token: row.token,
        inboxToken: row.inboxToken,
        history: row.history,
      }));
    }
    const detail = myDetail.data;
    if (detail && myRequest) {
      return [
        {
          communityId: detail.community.id,
          name: detail.community.name,
          status: detail.status,
          note: detail.note,
          round: detail.round,
          token: detail.token,
          history: detail.history,
        },
        ...detail.others.map((o) => ({ communityId: o.communityId, name: o.name, status: o.status, note: o.note, round: null, history: o.history })),
      ];
    }
    return [];
  }, [presenter.data, myDetail.data, myRequest]);

  const timeline = useMemo(() => {
    if (!run.data) return [];
    return buildTimeline({ run: run.data, messages: messages.data ?? [], deals: deals.data ?? [], approvals });
  }, [run.data, messages.data, deals.data, approvals]);

  const participantIds = run.data ? [run.data.leadId, ...run.data.partnerIds] : [];
  const myCommunityId = active?.communityId ?? null;
  const iAmIn = !!myCommunityId && participantIds.includes(myCommunityId);
  /** A saved (but not active) organiser link that belongs to this collab. */
  const otherSavedIdentity = !iAmIn ? (identities.find((i) => i.communityId && participantIds.includes(i.communityId)) ?? null) : null;

  return {
    run,
    messages,
    deals,
    communities,
    byId,
    cards,
    names,
    approvals,
    approvalsVisible: !!presenter.data || !!myDetail.data,
    myRequest: myDetail.data ? { token: myDetail.data.token, status: myDetail.data.status, round: myDetail.data.round, communityId: myDetail.data.community.id } : null,
    timeline,
    participantIds,
    myCommunityId,
    iAmIn,
    otherSavedIdentity,
    reload: () => {
      run.reload();
      messages.reload();
      deals.reload();
      presenter.reload();
      myDetail.reload();
    },
  };
}

export type ThreadData = ReturnType<typeof useThread>;
