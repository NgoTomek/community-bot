import type { Backend } from "@community-bots/core/backends";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pollApprovals } from "./approvals";
import { readableError } from "./errors";
import { createHandlers, type ClaimedJob } from "./handlers";

const EMPTY_MS = 1_000;
const APPROVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A claimed job row. Null from claim_job means the queue is empty. */
export function claimedJob(data: unknown): ClaimedJob | null {
  if (data == null || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.type !== "string") return null;
  return { id: row.id, type: row.type, params: row.params ?? {} };
}

export function startLoops(opts: { client: SupabaseClient; backend: Backend }): void {
  const { handleJob } = createHandlers(opts);
  void jobLoop(opts.client, handleJob);
  void approvalLoop(opts);
}

async function jobLoop(client: SupabaseClient, handleJob: (job: ClaimedJob) => Promise<unknown>): Promise<void> {
  for (;;) {
    try {
      const { data, error } = await client.rpc("claim_job");
      if (error) throw new Error(error.message);
      if (data == null) {
        await sleep(EMPTY_MS);
        continue;
      }
      const job = claimedJob(data);
      if (!job) {
        console.error("claim_job returned a row without id and type");
        await sleep(EMPTY_MS);
        continue;
      }
      console.log(`start ${job.type} ${job.id}`);
      try {
        const result = await handleJob(job);
        const { error: finishError } = await client.from("jobs").update({ status: "done", result, error: null }).eq("id", job.id);
        if (finishError) console.error(`finish ${job.id}: ${readableError(new Error(finishError.message))}`);
        else console.log(`done ${job.type} ${job.id}`);
      } catch (error) {
        const message = readableError(error);
        const { error: failError } = await client.from("jobs").update({ status: "error", error: message }).eq("id", job.id);
        if (failError) console.error(`fail ${job.id}: ${readableError(new Error(failError.message))}`);
        console.error(`error ${job.type} ${job.id}: ${message}`);
      }
    } catch (error) {
      console.error(`error loop: ${readableError(error)}`);
      await sleep(EMPTY_MS);
    }
  }
}

async function approvalLoop(opts: { client: SupabaseClient; backend: Backend }): Promise<void> {
  for (;;) {
    try {
      await pollApprovals(opts);
    } catch (error) {
      console.error(`approval poll: ${readableError(error)}`);
    }
    await sleep(APPROVAL_MS);
  }
}
