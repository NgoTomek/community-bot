import { MotionConfig } from "framer-motion";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "../../app/identity";
import { NeedsYouProvider } from "../../app/needsYou";
import { PresenterProvider } from "../../app/presenter";
import { ProjectorProvider } from "../../app/projector";
import { ThemeProvider } from "../../app/theme";
import { ToastProvider } from "../../components/ui/Toast";
import { DataProvider } from "../../data/DataProvider";
import { useRuns } from "../../data/hooks";
import RequestLinkPage from "../decision/RequestLinkPage";
import EventPage from "./EventPage";

function Finder() {
  const runs = useRuns();
  return (
    <ul className="p-6">
      {(runs.data ?? []).map((r) => (
        <li key={r.id}>
          {r.status} {r.round} <Link to={`/event/${r.dealId}`}>event {r.dealId}</Link> <Link to={`/run/${r.id}`}>{r.id}</Link>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <DataProvider>
            <ToastProvider>
              <IdentityProvider>
                <PresenterProvider>
                  <ProjectorProvider>
                    <NeedsYouProvider>
                      <main id="main">
                        <Routes>
                          <Route path="/event/:dealId" element={<EventPage />} />
                          <Route path="/r/:token" element={<RequestLinkPage />} />
                          <Route path="*" element={<Finder />} />
                        </Routes>
                      </main>
                    </NeedsYouProvider>
                  </ProjectorProvider>
                </PresenterProvider>
              </IdentityProvider>
            </ToastProvider>
          </DataProvider>
        </ThemeProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}
