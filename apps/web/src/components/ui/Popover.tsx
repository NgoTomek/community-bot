import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small anchored panel. Closes on Escape and outside clicks, and returns focus to the trigger.
 * Flips to align right when it would overflow the viewport.
 */
export function Popover({
  trigger,
  children,
  width = 340,
  label,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-controls": string; ref: (el: HTMLElement | null) => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setAlignRight(rect.left + Math.min(width, window.innerWidth - 32) > window.innerWidth - 16);
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector<HTMLElement>("button, a, input, textarea, [tabindex]");
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      {trigger({
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-controls": id,
        ref: (el) => {
          triggerRef.current = el;
        },
      })}
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          className={`card absolute top-full z-40 mt-2 p-4 text-left ${alignRight ? "right-0" : "left-0"}`}
          style={{ width: `min(${width}px, calc(100vw - 32px))`, boxShadow: "var(--shadow-pop)" }}
        >
          {children(close)}
        </div>
      ) : null}
    </span>
  );
}
