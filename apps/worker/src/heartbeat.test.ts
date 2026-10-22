import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHeartbeat, type HeartbeatClient } from "./heartbeat";

function fakeClient(result: () => Promise<{ error: { message: string } | null }>) {
  const upserts: unknown[][] = [];
  const client: HeartbeatClient = {
    from: (table) => {
      expect(table).toBe("worker_status");
      return {
        upsert: (row, options) => {
          upserts.push([row, options]);
          return result();
        },
      };
    },
  };
  return { client, upserts };
}

describe("startHeartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("upserts the single worker_status row at start and every 10 seconds", async () => {
    const { client, upserts } = fakeClient(async () => ({ error: null }));
    const stop = startHeartbeat(client, "mock");

    expect(upserts).toEqual([[{ id: 1, backend: "mock" }, { onConflict: "id" }]]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(upserts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(upserts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(upserts).toHaveLength(4);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(upserts).toHaveLength(4);
  });

  it("logs a failed beat and keeps beating", async () => {
    let calls = 0;
    const { client, upserts } = fakeClient(async () => {
      calls++;
      if (calls === 1) return { error: { message: "permission denied" } };
      if (calls === 2) throw new Error("network down");
      return { error: null };
    });
    const log = vi.fn();
    const stop = startHeartbeat(client, "grokbot", { log });

    await vi.advanceTimersByTimeAsync(20_000);
    stop();

    expect(upserts).toHaveLength(3);
    expect(log).toHaveBeenCalledWith("heartbeat failed: permission denied");
    expect(log).toHaveBeenCalledWith("heartbeat failed: network down");
    expect(log).toHaveBeenCalledTimes(2);
  });
});
