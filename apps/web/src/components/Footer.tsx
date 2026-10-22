import { Link } from "react-router-dom";

export const REPO_URL = import.meta.env.VITE_REPO_URL?.trim() || "https://github.com/NgoTomek/community-bot";

export function Footer() {
  return (
    <footer className="site-footer present-hide mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Community Bots is open source under the MIT licence. Bots propose; organisers decide.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer">
          <Link to="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link to="/demo" className="hover:text-ink">
            Replay a run
          </Link>
          <a href={REPO_URL} className="hover:text-ink" target="_blank" rel="noreferrer">
            Source code
          </a>
          <span className="max-sm:hidden">
            Press <kbd className="kbd">?</kbd> for shortcuts
          </span>
        </nav>
      </div>
    </footer>
  );
}
