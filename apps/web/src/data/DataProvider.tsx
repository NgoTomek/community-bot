import { createContext, useContext, useState, type ReactNode } from "react";
import { MockSource } from "./mock/mockSource";
import { SupabaseSource } from "./supabase/supabaseSource";
import type { DataSource } from "./types";

const SAMPLE_KEY = "cb.sample";

/** ?sample=1 forces the mock for this tab (?sample=0 clears it). Missing env also means mock. */
export function sampleModeRequested(search: string = typeof window !== "undefined" ? window.location.search : ""): boolean {
  const param = new URLSearchParams(search).get("sample");
  try {
    if (param === "1") sessionStorage.setItem(SAMPLE_KEY, "1");
    if (param === "0") sessionStorage.removeItem(SAMPLE_KEY);
    return sessionStorage.getItem(SAMPLE_KEY) === "1";
  } catch {
    return param === "1";
  }
}

export function createDataSource(): DataSource {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (sampleModeRequested() || !url || !key) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    return new MockSource({ storage });
  }
  return new SupabaseSource(url, key);
}

const DataContext = createContext<DataSource | null>(null);

export function DataProvider({ source, children }: { source?: DataSource; children: ReactNode }) {
  const [value] = useState<DataSource>(() => source ?? createDataSource());
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataSource {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
