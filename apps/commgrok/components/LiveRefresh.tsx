"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LIVE_CHANNEL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";

/**
 * Keeps the page live: when anything changes (approval, edit, publish, RSVP)
 * the server components re-render in place. Two phones side by side stay in sync.
 */
export function LiveRefresh({ mode }: { mode: "local" | "supabase" }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 120);
    };
    let cleanup = () => {};

    if (mode === "supabase" && SUPABASE_URL && SUPABASE_ANON_KEY) {
      let stopped = false;
      let remove: (() => void) | undefined;
      import("@supabase/supabase-js").then(({ createClient }) => {
        if (stopped) return;
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        const ch = client.channel(LIVE_CHANNEL).on("broadcast", { event: "change" }, refresh).subscribe();
        remove = () => void client.removeChannel(ch);
      });
      cleanup = () => {
        stopped = true;
        remove?.();
      };
    } else {
      let opened = 0;
      const es = new EventSource("/api/live");
      es.onmessage = refresh;
      es.onopen = () => {
        if (opened++ > 0) refresh(); // reconnected: catch up on anything we missed
      };
      cleanup = () => es.close();
    }

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      cleanup();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [mode, router]);
  return null;
}
