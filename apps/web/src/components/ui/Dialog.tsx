import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  return ref;
}

/** Modal dialog on the native <dialog> element: focus trap, Escape and the top layer for free. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useNativeDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="cb-dialog"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {title}
            </h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
          {description ? <div className="mt-2 text-muted">{description}</div> : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Side sheet on desktop, bottom sheet on phones. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useNativeDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="cb-sheet"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
            <h2 id={titleId} className="font-display text-2xl leading-tight">
              {title}
            </h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2" onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-6 py-6">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${destructive ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm} disabled={busy} autoFocus>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
