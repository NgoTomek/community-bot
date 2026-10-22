import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { errorMessage } from "./errors";
import { supabase } from "./supabase";

export type LiveTable = "messages" | "runs" | "jobs" | "deals";

export function useLiveQuery<T>({
  enabled,
  key,
  load,
  watch = [],
  pollMs = 0,
}: {
  enabled: boolean;
  key: string;
  load: () => Promise<T>;
  watch?: { table: LiveTable; filter?: string }[];
  pollMs?: number;
}): { data: T | undefined; error: string | null; loading: boolean; refresh: () => void } {
  const loadRef = useRef(load);
  loadRef.current = load;
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const refreshRef = useRef<() => void>(() => {});
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancel = false;
    let seq = 0;
    const run = () => {
      const id = ++seq;
      return loadRef.current().then(
        (next) => {
          if (cancel || id !== seq) return;
          setData(next);
          setError(null);
          setLoading(false);
        },
        (err: unknown) => {
          if (cancel || id !== seq) return;
          setError(errorMessage(err));
          setLoading(false);
        },
      );
    };
    refreshRef.current = () => {
      void run();
    };
    setLoading(true);
    setData(undefined);
    setError(null);
    void run();
    const timer = pollMs > 0 ? window.setInterval(() => void run(), pollMs) : 0;

    let channel: RealtimeChannel | null = null;
    const tables = watchRef.current;
    if (supabase && tables.length > 0) {
      channel = supabase.channel(`cb:${key}:${Math.random().toString(36).slice(2, 8)}`);
      for (const item of tables) {
        const spec = item.filter
          ? { event: "*" as const, schema: "public", table: item.table, filter: item.filter }
          : { event: "*" as const, schema: "public", table: item.table };
        channel = channel.on("postgres_changes", spec, () => void run());
      }
      channel.subscribe();
    }

    return () => {
      cancel = true;
      if (timer) window.clearInterval(timer);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [enabled, key, pollMs]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { data, error, loading, refresh };
}
