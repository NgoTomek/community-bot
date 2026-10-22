import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: "info" | "ok" | "bad";
  action?: { label: string; to: string } | { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      const duration = toast.duration ?? 5000;
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = toast.tone === "bad" ? TriangleAlert : toast.tone === "ok" ? CheckCircle2 : Info;
            const color = toast.tone === "bad" ? "text-bad" : toast.tone === "ok" ? "text-ok" : "text-accent";
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-4"
                style={{ boxShadow: "var(--shadow-pop)" }}
              >
                <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{toast.title}</p>
                  {toast.body ? <p className="mt-1 text-sm text-muted">{toast.body}</p> : null}
                  {toast.action ? (
                    "to" in toast.action ? (
                      <Link to={toast.action.to} className="mt-2 inline-block text-sm font-medium text-accent hover:underline" onClick={() => dismiss(toast.id)}>
                        {toast.action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="mt-2 text-sm font-medium text-accent hover:underline"
                        onClick={() => {
                          (toast.action as { onClick: () => void }).onClick();
                          dismiss(toast.id);
                        }}
                      >
                        {toast.action.label}
                      </button>
                    )
                  ) : null}
                </div>
                <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2 -mt-1" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                  <X size={16} aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
