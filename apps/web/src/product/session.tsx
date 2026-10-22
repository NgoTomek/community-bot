import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { readPasscode, writePasscode } from "../lib/passcode";
import { errorMessage, isWrongPasscode } from "./errors";
import { withPresent } from "./url";

interface PasscodeContextValue {
  passcode: string | null;
  notice: string | null;
  save: (value: string) => void;
  clear: () => void;
  report: (error: unknown) => string;
}

const PasscodeContext = createContext<PasscodeContextValue | null>(null);

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [passcode, setPasscode] = useState<string | null>(() => readPasscode());
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback((value: string) => {
    const next = value.trim();
    if (!next) return;
    writePasscode(next);
    setPasscode(next);
    setNotice(null);
  }, []);

  const clear = useCallback(() => {
    writePasscode(null);
    setPasscode(null);
  }, []);

  const report = useCallback((error: unknown) => {
    const message = errorMessage(error);
    if (isWrongPasscode(message)) {
      writePasscode(null);
      setPasscode(null);
      setNotice(message);
    }
    return message;
  }, []);

  const value = useMemo(
    () => ({ passcode, notice, save, clear, report }),
    [passcode, notice, save, clear, report],
  );

  return <PasscodeContext.Provider value={value}>{children}</PasscodeContext.Provider>;
}

export function usePasscode(): PasscodeContextValue {
  const value = useContext(PasscodeContext);
  if (!value) throw new Error("usePasscode must be used inside PasscodeProvider");
  return value;
}

const BackendContext = createContext<{
  backend: string | null;
  setBackend: (backend: string | null) => void;
} | null>(null);

export function BackendProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<string | null>(null);
  const value = useMemo(() => ({ backend, setBackend }), [backend]);
  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): string | null {
  return useContext(BackendContext)?.backend ?? null;
}

export function useRegisterBackend(backend: string | null | undefined) {
  const ctx = useContext(BackendContext);
  const setBackend = ctx?.setBackend;
  useEffect(() => {
    if (!setBackend) return;
    setBackend(backend && backend.trim() ? backend : null);
    return () => setBackend(null);
  }, [backend, setBackend]);
}

export function usePresent(): boolean {
  const [params] = useSearchParams();
  return params.get("present") === "1";
}

export function PresentSync() {
  const on = usePresent();
  useEffect(() => {
    document.documentElement.classList.toggle("present", on);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", on ? "#141210" : "#f3ecdf");
    return () => {
      document.documentElement.classList.remove("present");
      if (meta) meta.setAttribute("content", "#f3ecdf");
    };
  }, [on]);
  return null;
}

export function AppLink({ to, ...props }: { to: string } & Omit<ComponentProps<typeof Link>, "to">) {
  const present = usePresent();
  return <Link to={withPresent(to, present)} {...props} />;
}
