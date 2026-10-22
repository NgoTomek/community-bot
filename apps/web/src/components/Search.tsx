import { Search as SearchIcon } from "lucide-react";
import { forwardRef, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCommunities, useRuns } from "../data/hooks";
import { truncate } from "../lib/format";
import { Avatar } from "./Avatar";
import { runStatusLabel } from "./Badges";

interface Result {
  key: string;
  to: string;
  label: string;
  sub: string;
  avatar: { id: string; name: string };
}

/** Jump to any community or collab. "/" focuses it. */
export const GlobalSearch = forwardRef<HTMLInputElement, { className?: string; onNavigate?: () => void }>(function GlobalSearch({ className = "", onNavigate }, ref) {
  const communities = useCommunities();
  const runs = useRuns();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const listId = useId();

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const names = Object.fromEntries((communities.data ?? []).map((c) => [c.id, c.name]));
    const people = (communities.data ?? [])
      .filter((c) => [c.name, c.card.tagline ?? "", c.card.location ?? ""].some((s) => s.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((c) => ({ key: `c:${c.id}`, to: `/c/${c.id}`, label: c.name, sub: c.card.tagline ?? "Community", avatar: { id: c.id, name: c.name } }));
    const collabs = (runs.data ?? [])
      .filter((r) => [r.need, names[r.leadId] ?? "", ...r.partnerIds.map((p) => names[p] ?? "")].some((s) => s.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((r) => ({
        key: `r:${r.id}`,
        to: `/run/${r.id}`,
        label: truncate(r.need, 70),
        sub: `${runStatusLabel(r)} · led by ${names[r.leadId] ?? r.leadId}`,
        avatar: { id: r.leadId, name: names[r.leadId] ?? r.leadId },
      }));
    return [...people, ...collabs];
  }, [query, communities.data, runs.data]);

  const go = (result: Result) => {
    navigate(result.to);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  };

  const showList = open && query.trim().length > 0;
  return (
    <div className={`relative ${className}`}>
      <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[index] ? `${listId}-${index}` : undefined}
        aria-label="Search communities and collabs"
        placeholder="Search"
        className="input h-9 min-h-9 bg-surface-2 pl-9 pr-8 text-sm"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[index]) {
            e.preventDefault();
            go(results[index]);
          } else if (e.key === "Escape") {
            setQuery("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {!query ? <span className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 max-sm:hidden">/</span> : null}
      {showList ? (
        <ul id={listId} role="listbox" className="card absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto p-1" style={{ boxShadow: "var(--shadow-pop)" }}>
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Nothing matches “{query}”.</li>
          ) : (
            results.map((result, i) => (
              <li
                key={result.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === index}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === index ? "bg-sunken" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(result);
                }}
                onMouseEnter={() => setIndex(i)}
              >
                <Avatar id={result.avatar.id} name={result.avatar.name} size={24} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.label}</span>
                  <span className="block truncate text-xs text-muted">{result.sub}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
});
