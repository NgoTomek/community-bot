import { FlaskConical, Plus, Search as SearchIcon, Sparkles, X } from "lucide-react";
import { forwardRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useNeedsYou } from "../app/needsYou";
import { useTour } from "../app/tour";
import { useData } from "../data/DataProvider";
import { useRuns } from "../data/hooks";
import { useNewRequest } from "../features/request/NewRequest";
import { BackendBadge } from "./Badges";
import { IdentityMenu } from "./IdentityMenu";
import { GlobalSearch } from "./Search";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-ink text-bg" aria-hidden>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="8" cy="12" r="3.2" />
          <circle cx="16" cy="12" r="3.2" />
          <path d="M11.2 12h1.6" />
        </svg>
      </span>
      <span className="font-display text-[19px] font-medium leading-none tracking-tight">Community Bots</span>
    </span>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-2 py-1 text-sm ${isActive ? "font-medium text-ink" : "text-muted hover:text-ink"}`;

export const Header = forwardRef<HTMLInputElement>(function Header(_, searchRef) {
  const source = useData();
  const runs = useRuns();
  const { open } = useNewRequest();
  const { pending } = useNeedsYou();
  const tour = useTour();
  const [mobileSearch, setMobileSearch] = useState(false);
  const backend = source.kind === "mock" ? "mock" : (runs.data?.[0]?.backend ?? null);

  return (
    <header className="site-header sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
      {source.kind === "mock" ? (
        <div className="border-b border-warn/20 bg-warn-soft">
          <p className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 py-1.5 text-[13px] text-warn sm:px-6">
            <FlaskConical size={14} className="shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Sample data, not a real Bot run.</strong>
              <span className="max-sm:hidden"> Every community, Bot post and deal here is invented so you can try the flow.</span>
            </span>
            {tour.available && !tour.active ? (
              <button type="button" className="ml-auto shrink-0 font-semibold underline underline-offset-2 hover:no-underline" onClick={() => tour.start()}>
                Take the guided tour →
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
        {mobileSearch ? (
          <>
            <GlobalSearch ref={searchRef} className="flex-1" onNavigate={() => setMobileSearch(false)} />
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setMobileSearch(false)} aria-label="Close search">
              <X size={18} aria-hidden />
            </button>
          </>
        ) : (
          <>
            <Link to="/" className="shrink-0 rounded-md" aria-label="Community Bots, board">
              <Logo />
            </Link>
            <nav className="ml-2 flex items-center gap-1 max-md:hidden" aria-label="Main">
              <NavLink to="/" end className={navClass}>
                Board
                {pending.length ? <span className="ml-1.5 rounded-full bg-accent-bg px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">{pending.length}</span> : null}
              </NavLink>
              <NavLink to="/walkthrough" className={navClass}>
                Walkthrough
              </NavLink>
              <NavLink to="/demo" className={navClass}>
                Replay
              </NavLink>
              <NavLink to="/how-it-works" className={navClass}>
                How it works
              </NavLink>
              {tour.available ? (
                <button type="button" className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft" onClick={() => tour.start()}>
                  <Sparkles size={14} aria-hidden /> Guided tour
                </button>
              ) : null}
            </nav>
            <GlobalSearch ref={searchRef} className="ml-auto w-56 max-md:hidden lg:w-64" />
            <div className="flex items-center gap-1 max-md:ml-auto">
              <button type="button" className="btn btn-ghost btn-icon md:hidden" onClick={() => setMobileSearch(true)} aria-label="Search">
                <SearchIcon size={18} aria-hidden />
              </button>
              <span className="max-sm:hidden">
                <BackendBadge backend={backend} title={source.kind === "mock" ? "Sample data from the mock backend" : "Backend of the latest run"} />
              </span>
              <IdentityMenu />
              <button type="button" className="btn btn-primary h-9 min-h-9 px-3" onClick={() => open()} aria-keyshortcuts="n">
                <Plus size={16} aria-hidden />
                <span className="max-sm:sr-only">New request</span>
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
});
