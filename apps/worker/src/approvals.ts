import type { Backend } from "@community-bots/core/backends";
import type { SupabaseClient } from "@supabase/supabase-js";
import { announcementsForDeal } from "./announce";
import { listAnnouncements, listApprovals, listPendingRuns, updateRunWhere, upsertAnnouncements, type RunRecord } from "./db";
import { readableError } from "./errors";
import { LeaveRun, renegotiateRun } from "./renegotiate";
import { claimable, resolveApprovalWave } from "./wave";

async function ensureAnnouncements(client: SupabaseClient, backend: Backend, run: RunRecord): Promise<void> {
  if (!run.deal_id) return;
  const existing = await listAnnouncements(client, run.deal_id);
  if (existing.length > 0) return;
  const { data, error } = await client.from("deals").select("deal").eq("id", run.deal_id).maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data as { deal?: unknown } | null)?.deal;
  const items = await announcementsForDeal(backend, raw);
  await upsertAnnouncements(client, run.deal_id, items);
}

async function settle(opts: { client: SupabaseClient; backend: Backend }, run: RunRecord): Promise<void> {
  if (!claimable(run.status)) return;
  const approvals = await listApprovals(opts.client, run.id);
  const decision = resolveApprovalWave(approvals, run.round);
  if (decision.action === "wait") return;

  if (decision.action === "decline" || decision.action === "give_up") {
    const reason = decision.action === "decline" ? decision.note : "no agreement";
    const won = await updateRunWhere(
      opts.client,
      run.id,
      { status: "declined", decline_reason: reason, typing: null },
      ["pending_approval"],
    );
    if (won && run.deal_id) {
      await opts.client.from("deals").update({ status: "declined" }).eq("id", run.deal_id);
    }
    return;
  }

  if (decision.action === "confirm") {
    await ensureAnnouncements(opts.client, opts.backend, run);
    const won = await updateRunWhere(opts.client, run.id, { status: "confirmed", typing: null, error: null }, ["pending_approval"]);
    if (won && run.deal_id) {
      await opts.client.from("deals").update({ status: "confirmed" }).eq("id", run.deal_id);
    }
    return;
  }

  try {
    await renegotiateRun({ client: opts.client, backend: opts.backend, runId: run.id });
  } catch (error) {
    if (!(error instanceof LeaveRun)) {
      console.error(`renegotiate ${run.id}: ${readableError(error)}`);
    }
  }
}

/** Moves every run sitting in pending_approval. One compare-and-set per run, so two polls cannot both win. */
export async function pollApprovals(opts: { client: SupabaseClient; backend: Backend }): Promise<void> {
  const runs = await listPendingRuns(opts.client);
  for (const run of runs) {
    try {
      await settle(opts, run);
    } catch (error) {
      console.error(`approval ${run.id}: ${readableError(error)}`);
    }
  }
}
