import { KeyRound } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "../components/ui/Dialog";
import { useToast } from "../components/ui/Toast";
import { useData } from "../data/DataProvider";
import { errorText } from "../data/hooks";
import { readPasscode, writePasscode } from "../lib/passcode";

interface PresenterValue {
  passcode: string | null;
  /** Presenter mode: the passcode is set, so this tab can act for any community. */
  isPresenter: boolean;
  /**
   * For passcode-gated calls. Resolves to the passcode (null on the mock, which needs none),
   * or `false` when the user cancels.
   */
  ensurePasscode: (reason?: string) => Promise<string | null | false>;
  enter: () => void;
  exit: () => void;
}

const PresenterContext = createContext<PresenterValue | null>(null);

export function PresenterProvider({ children }: { children: ReactNode }) {
  const source = useData();
  const toast = useToast();
  const [passcode, setPasscode] = useState<string | null>(readPasscode);
  const [dialog, setDialog] = useState<{ reason: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const waiters = useRef<((value: string | false) => void)[]>([]);

  const settle = useCallback((value: string | false) => {
    waiters.current.forEach((resolve) => resolve(value));
    waiters.current = [];
  }, []);

  const ask = useCallback((reason: string) => {
    setDraft("");
    setError(null);
    setDialog({ reason });
    return new Promise<string | false>((resolve) => waiters.current.push(resolve));
  }, []);

  const ensurePasscode = useCallback(
    async (reason = "Starting Bots needs the organiser passcode.") => {
      if (passcode) return passcode;
      if (!source.needsPasscode) return null;
      return ask(reason);
    },
    [passcode, source.needsPasscode, ask],
  );

  const close = () => {
    setDialog(null);
    settle(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await source.verifyPasscode(value);
      if (!ok) {
        setError("That passcode is not right. Ask whoever runs this instance.");
        return;
      }
      writePasscode(value);
      setPasscode(value);
      setDialog(null);
      settle(value);
      toast({ title: "Presenter mode on", body: "This tab can act for any community until you close it.", tone: "ok" });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo<PresenterValue>(
    () => ({
      passcode,
      isPresenter: !!passcode,
      ensurePasscode,
      enter: () => void ask("Presenter mode lets this tab act for any community and shows each organiser's phone link."),
      exit: () => {
        writePasscode(null);
        setPasscode(null);
        toast({ title: "Presenter mode off" });
      },
    }),
    [passcode, ensurePasscode, ask, toast],
  );

  return (
    <PresenterContext.Provider value={value}>
      {children}
      <Dialog
        open={!!dialog}
        onClose={close}
        title="Organiser passcode"
        description={
          <>
            {dialog?.reason} It is kept for this tab only.
            {!source.needsPasscode ? <span className="mt-1 block text-sm">Sample mode accepts any passcode.</span> : null}
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="sr-only">Passcode</span>
            <span className="relative block">
              <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
              <input
                className="input pl-9"
                type="password"
                autoComplete="off"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Passcode"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "passcode-error" : undefined}
              />
            </span>
          </label>
          {error ? (
            <p id="passcode-error" className="text-sm text-bad">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        </form>
      </Dialog>
    </PresenterContext.Provider>
  );
}

export function usePresenter(): PresenterValue {
  const ctx = useContext(PresenterContext);
  if (!ctx) throw new Error("usePresenter must be used inside PresenterProvider");
  return ctx;
}
