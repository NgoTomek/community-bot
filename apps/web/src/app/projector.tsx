import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRuns } from "../data/hooks";

const KEY = "cb.present";

/** ?present=1 (projector view): large type, admin controls hidden, follows the live run. */
const ProjectorContext = createContext<{ present: boolean; setPresent: (on: boolean) => void } | null>(null);

export function ProjectorProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [present, setPresentState] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const param = new URLSearchParams(location.search).get("present");
    if (param === "1" || param === "0") setPresentState(param === "1");
  }, [location.search]);

  useEffect(() => {
    document.documentElement.classList.toggle("present", present);
    try {
      if (present) sessionStorage.setItem(KEY, "1");
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, [present]);

  const value = useMemo(() => ({ present, setPresent: setPresentState }), [present]);
  return (
    <ProjectorContext.Provider value={value}>
      {children}
      {present ? <FollowLiveRun /> : null}
    </ProjectorContext.Provider>
  );
}

export function useProjector() {
  const ctx = useContext(ProjectorContext);
  if (!ctx) throw new Error("useProjector must be used inside ProjectorProvider");
  return ctx;
}

/** On the board or a finished thread, jump to the newest run that is negotiating. */
function FollowLiveRun() {
  const runs = useRuns();
  const location = useLocation();
  const navigate = useNavigate();
  const live = (runs.data ?? []).find((r) => r.control === "running" && (r.status === "negotiating" || r.status === "compiling"));
  useEffect(() => {
    if (!live) return;
    const onBoard = location.pathname === "/board";
    const threadId = location.pathname.startsWith("/run/") ? location.pathname.slice(5) : null;
    const current = threadId ? (runs.data ?? []).find((r) => r.id === threadId) : null;
    const currentIsLive = current && (current.status === "negotiating" || current.status === "compiling" || current.status === "pending_approval");
    if (onBoard || (threadId && threadId !== live.id && !currentIsLive)) navigate(`/run/${live.id}`);
  }, [live, location.pathname, navigate, runs.data]);
  return null;
}
