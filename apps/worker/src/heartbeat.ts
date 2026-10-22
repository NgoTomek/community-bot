import type { BackendName } from "@community-bots/core";

export const HEARTBEAT_MS = 10_000;

type UpsertResult = { error: { message: string } | null };

/** The single call the heartbeat makes, so tests can fake it without supabase-js. */
export type HeartbeatClient = {
  from: (table: "worker_status") => {
    upsert: (row: { id: 1; backend: BackendName }, options: { onConflict: "id" }) => PromiseLike<UpsertResult>;
  };
};

/**
 * Upserts worker_status(id = 1, backend) now and every 10 seconds. The database stamps
 * last_seen; get_worker_status() reports the worker online for 30 seconds after a beat.
 * A failed beat is logged, never thrown. Returns a function that stops the heartbeat.
 */
export function startHeartbeat(
  client: HeartbeatClient,
  backend: BackendName,
  opts: { intervalMs?: number; log?: (line: string) => void } = {},
): () => void {
  const log = opts.log ?? console.log;
  const beat = async () => {
    try {
      const { error } = await client.from("worker_status").upsert({ id: 1, backend }, { onConflict: "id" });
      if (error) log(`heartbeat failed: ${error.message}`);
    } catch (err) {
      log(`heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), opts.intervalMs ?? HEARTBEAT_MS);
  return () => clearInterval(timer);
}
