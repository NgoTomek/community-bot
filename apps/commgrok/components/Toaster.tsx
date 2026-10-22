"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, WifiOff, AlertCircle, Info } from "lucide-react";

export type ToastKind = "success" | "error" | "info" | "offline";
type Toast = { id: number; message: string; kind: ToastKind };

/** Show a toast from anywhere on the client. */
export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(new CustomEvent("cb-toast", { detail: { message, kind } }));
}

/** Call before a mutation. Returns false (and shows the offline toast) when there's no connection. */
export function ensureOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast("You're offline. Try again when you're back online.", "offline");
    return false;
  }
  return true;
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info, offline: WifiOff };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as { message: string; kind: ToastKind };
      const id = ++n;
      setToasts((t) => [...t.slice(-2), { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
    };
    const onOffline = () => onToast(new CustomEvent("x", { detail: { message: "You're offline. Saved pages still work.", kind: "offline" } }));
    const onOnline = () => onToast(new CustomEvent("x", { detail: { message: "Back online", kind: "success" } }));
    window.addEventListener("cb-toast", onToast);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("cb-toast", onToast);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="toast-in pointer-events-auto flex max-w-[520px] items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-medium shadow-lg shadow-black/10"
          >
            <Icon
              aria-hidden
              className={`size-4 shrink-0 ${t.kind === "success" ? "text-ok" : t.kind === "error" ? "text-bad" : t.kind === "offline" ? "text-warn" : "text-accent-text"}`}
            />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
