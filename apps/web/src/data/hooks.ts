import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useData } from "./DataProvider";
import { DataError, type RpcName, type RpcState, type Topic } from "./types";

export interface Live<T> {
  data: T | undefined;
  error: string | null;
  errorCode: DataError["code"] | null;
  /** True only before the first successful load (keeps old data on screen while refreshing). */
  loading: boolean;
  reload: () => void;
}

export interface LiveOptions {
  topics: Topic[];
  /** "fallback": poll only while realtime is down. "always": poll regardless (RPC-only data). */
  poll?: "fallback" | "always" | "never";
  intervalMs?: number;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}

/**
 * Loads data for `key`, reloads on realtime topics, and polls every 2s as the fallback.
 * A null key disables the hook. Responses that arrive out of order are dropped.
 */
export function useLive<T>(key: string | null, load: () => Promise<T>, options: LiveOptions): Live<T> {
  const source = useData();
  const { poll = "fallback", intervalMs = 2000 } = options;
  const topicsKey = options.topics.join("|");
  const [state, setState] = useState<{ key: string | null; data?: T; error: string | null; code: DataError["code"] | null; done: boolean }>({
    key,
    error: null,
    code: null,
    done: false,
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  const issued = useRef(0);
  const applied = useRef(0);

  const run = useCallback(async () => {
    if (key === null) return;
    const id = ++issued.current;
    try {
      const data = await loadRef.current();
      if (id < applied.current) return;
      applied.current = id;
      setState({ key, data, error: null, code: null, done: true });
    } catch (error) {
      if (id < applied.current) return;
      applied.current = id;
      setState((prev) => ({
        key,
        data: prev.key === key ? prev.data : undefined,
        error: errorText(error),
        code: error instanceof DataError ? error.code : null,
        done: true,
      }));
    }
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    setState((prev) => (prev.key === key ? prev : { key, error: null, code: null, done: false }));
    void run();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = source.subscribe(topicsKey ? topicsKey.split("|") : [], () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void run(), 40);
    });
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (poll === "never") return;
      if (poll === "fallback" && source.realtimeHealthy()) return;
      void run();
    }, intervalMs);
    return () => {
      unsubscribe();
      clearInterval(interval);
      if (debounce) clearTimeout(debounce);
    };
  }, [key, topicsKey, run, source, poll, intervalMs]);

  const current = state.key === key ? state : { key, data: undefined, error: null, code: null, done: false };
  return {
    data: current.data,
    error: current.error,
    errorCode: current.code,
    loading: key !== null && !current.done && current.data === undefined,
    reload: () => void run(),
  };
}

// ---------------------------------------------------------------------------
// Typed hooks
// ---------------------------------------------------------------------------

export function useCommunities() {
  const source = useData();
  return useLive("communities", () => source.listCommunities(), { topics: ["communities"], poll: "always", intervalMs: 10_000 });
}

export function useCommunity(id: string | undefined) {
  const source = useData();
  return useLive(id ? `community:${id}` : null, () => source.getCommunity(id!), {
    topics: id ? [`community:${id}`, "communities"] : [],
    poll: "always",
    intervalMs: 10_000,
  });
}

export function useRuns() {
  const source = useData();
  return useLive("runs", () => source.listRuns(), { topics: ["runs"] });
}

export function useRun(id: string | undefined) {
  const source = useData();
  return useLive(id ? `run:${id}` : null, () => source.getRun(id!), { topics: id ? [`run:${id}`] : [] });
}

export function useMessages(runId: string | undefined) {
  const source = useData();
  return useLive(runId ? `messages:${runId}` : null, () => source.listMessages(runId!), { topics: runId ? [`messages:${runId}`] : [] });
}

export function useDeals(runId: string | undefined) {
  const source = useData();
  return useLive(runId ? `deals:${runId}` : null, () => source.listDeals(runId!), { topics: runId ? [`deals:${runId}`] : [] });
}

export function useLastPosts(runIds: string[]) {
  const source = useData();
  const key = runIds.length ? `last:${[...runIds].sort().join(",")}` : null;
  return useLive(key, () => source.lastBotPosts(runIds), { topics: ["runs"] });
}

export function useJob(id: string | null) {
  const source = useData();
  return useLive(id ? `job:${id}` : null, () => source.getJob(id!), { topics: id ? [`job:${id}`] : [] });
}

export function useAnnouncements(dealId: string | null | undefined) {
  const source = useData();
  return useLive(dealId ? `ann:${dealId}` : null, () => source.listAnnouncements(dealId!), {
    topics: dealId ? [`event:${dealId}`] : [],
    poll: "always",
    intervalMs: 5000,
  });
}

export function useEvent(dealId: string | undefined) {
  const source = useData();
  return useLive(dealId ? `event:${dealId}` : null, () => source.getEvent(dealId!), {
    topics: dealId ? [`event:${dealId}`] : [],
    poll: "always",
    intervalMs: 2000,
  });
}

export function useRequestDetail(token: string | undefined) {
  const source = useData();
  return useLive(token ? `request:${token}` : null, () => source.getRequest(token!), { topics: ["approvals"], poll: "always", intervalMs: 2500 });
}

export function usePresenterStatus(passcode: string | null, runId: string | undefined) {
  const source = useData();
  return useLive(passcode && runId ? `presenter:${runId}` : null, () => source.presenterStatus(passcode!, runId!), {
    topics: runId ? [`approvals:${runId}`] : [],
    poll: "always",
    intervalMs: 2500,
  });
}

/** Whether an RPC exists on this backend. Probes once, without side effects. */
export function useRpcState(name: RpcName): RpcState {
  const source = useData();
  useEffect(() => {
    void source.probe();
  }, [source]);
  const subscribe = useCallback((cb: () => void) => source.onCapabilities(cb), [source]);
  return useSyncExternalStore(subscribe, () => source.rpcState(name), () => "unknown");
}

/** Ticks every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useStableIds(ids: string[]): string[] {
  const key = ids.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ids, [key]);
}
