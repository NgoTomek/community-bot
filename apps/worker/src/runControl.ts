import type { HumanPost, RunControlSource, RunControlState, Stance } from "@community-bots/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DbRunControl = RunControlSource & {
  /** Messages the worker wrote itself (the need, renegotiation notes) are never organiser posts. */
  ignore(messageId: string): void;
};

/**
 * Reads runs.control and organiser posts (rows written by post_message) for one run.
 * `afterSeq` skips posts from earlier rounds when a run is renegotiated.
 */
export function createRunControl(client: SupabaseClient, runId: string, opts: { afterSeq?: number } = {}): DbRunControl {
  const seen = new Set<string>();
  const afterSeq = opts.afterSeq ?? -1;

  return {
    ignore(messageId) {
      seen.add(messageId);
    },

    async state() {
      const { data, error } = await client.from("runs").select("control").eq("id", runId).single();
      if (error) throw new Error(`Could not read the run's pause/stop control: ${error.message}`);
      return ((data as { control: RunControlState | null }).control ?? "running") as RunControlState;
    },

    async newHumanPosts() {
      const { data, error } = await client
        .from("messages")
        .select("id, text, as_community")
        .eq("run_id", runId)
        .eq("role", "human")
        .gt("seq", afterSeq)
        .order("seq", { ascending: true });
      if (error) throw new Error(`Could not read organiser messages: ${error.message}`);
      const rows = (data ?? []) as { id: string; text: string; as_community: string | null }[];
      const fresh = rows.filter((row) => !seen.has(row.id));
      for (const row of fresh) seen.add(row.id);
      return fresh.map((row): HumanPost => ({ id: row.id, text: row.text, asCommunity: row.as_community ?? null }));
    },

    async recordReplyStance(postIds: string[], stance: Stance) {
      if (postIds.length === 0) return;
      const { error } = await client.from("messages").update({ stance }).in("id", postIds);
      if (error) throw new Error(`Could not record the organiser's stance: ${error.message}`);
    },
  };
}
