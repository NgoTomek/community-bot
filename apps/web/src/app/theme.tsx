import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "cb.theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const ThemeContext = createContext<{ pref: ThemePref; dark: boolean; setPref: (p: ThemePref) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const dark = pref === "dark" || (pref === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      if (p === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeContext.Provider value={{ pref, dark, setPref }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
