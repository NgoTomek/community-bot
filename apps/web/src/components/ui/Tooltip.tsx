import { useId, type ReactNode } from "react";
import { useRpcState } from "../../data/hooks";
import type { RpcName } from "../../data/types";

/**
 * Hover and focus tooltip. When the wrapped control is disabled, the wrapper itself takes
 * focus so keyboard users still hear why (disabled buttons cannot be focused).
 */
export function Tooltip({
  label,
  children,
  side = "top",
  focusable = false,
  className = "",
}: {
  label: string | null | undefined;
  children: ReactNode;
  side?: "top" | "bottom";
  focusable?: boolean;
  className?: string;
}) {
  const id = useId();
  if (!label) return <>{children}</>;
  return (
    <span className={`group/tip relative inline-flex ${className}`} tabIndex={focusable ? 0 : undefined} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-center text-xs font-medium leading-snug text-bg opacity-0 shadow-sm transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 group-focus/tip:opacity-100 ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export const NOT_READY = "backend not ready";

/** Disabled state and tooltip for a control whose RPC may not exist yet. */
export function useGate(name: RpcName): { disabled: boolean; reason: string | null } {
  const state = useRpcState(name);
  return state === "missing" ? { disabled: true, reason: NOT_READY } : { disabled: false, reason: null };
}
