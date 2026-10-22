import { useLocation } from "react-router-dom";
import { AppLink, useBackend } from "./session";
import { repoUrl } from "./url";
import { SampleStamp } from "./ui";

function dateLine(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function Header() {
  const backend = useBackend();
  const { pathname } = useLocation();
  const repo = repoUrl();
  return (
    <header className="mast">
      <div className="mast-row">
        <AppLink to="/" className="wordmark">
          Community Bots
        </AppLink>
        {backend ? (
          <div className="backend-marks">
            <span className="backend-pill">{backend}</span>
            {backend === "mock" ? <SampleStamp /> : null}
          </div>
        ) : null}
      </div>
      <p className="dateline">{dateLine()} · A noticeboard for organisers</p>
      <nav className="nav" aria-label="Main">
        <AppLink to="/" aria-current={pathname === "/" ? "page" : undefined}>
          Directory
        </AppLink>
        <AppLink to="/how-it-works" aria-current={pathname === "/how-it-works" ? "page" : undefined}>
          How it works
        </AppLink>
        {repo ? (
          <a href={repo} rel="noreferrer">
            Repository
          </a>
        ) : null}
      </nav>
    </header>
  );
}

export function Footer() {
  const repo = repoUrl();
  return (
    <footer className="colophon">
      <p>Community Bots</p>
      <nav aria-label="Footer">
        <AppLink to="/">Directory</AppLink>
        <AppLink to="/how-it-works">How it works</AppLink>
        {repo ? (
          <a href={repo} rel="noreferrer">
            Repository
          </a>
        ) : (
          <span>VITE_REPO_URL is unset.</span>
        )}
      </nav>
    </footer>
  );
}
