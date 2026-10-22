import { BrowserRouter, Route, Routes } from "react-router-dom";
import { IdentityProvider } from "./app/identity";
import { NeedsYouProvider } from "./app/needsYou";
import { PresenterProvider } from "./app/presenter";
import { ProjectorProvider } from "./app/projector";
import { ThemeProvider } from "./app/theme";
import { TourProvider } from "./app/tour";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ToastProvider } from "./components/ui/Toast";
import EventPage from "./features/event/EventPage";
import { NewRequestProvider } from "./features/request/NewRequest";
import WalkthroughPage from "./features/walkthrough/WalkthroughPage";
import Add from "./pages/Add";
import Board from "./pages/Board";
import CommunityProfile from "./pages/CommunityProfile";
import HowItWorks from "./pages/HowItWorks";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import ReplayPage from "./pages/Replay";
import RequestLink from "./pages/RequestLink";
import Thread from "./pages/Thread";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <ThemeProvider>
        <ToastProvider>
          <ProjectorProvider>
            <PresenterProvider>
              <IdentityProvider>
                <NeedsYouProvider>
                  <NewRequestProvider>
                    <TourProvider>
                      <div className="min-h-screen bg-bg text-text">
                        <a className="skip" href="#content">
                          Skip to content
                        </a>
                        <Header />
                        <main id="content" tabIndex={-1}>
                          <Routes>
                            <Route path="/" element={<Landing />} />
                            <Route path="/board" element={<Board />} />
                            <Route path="/how-it-works" element={<HowItWorks />} />
                            <Route path="/walkthrough" element={<WalkthroughPage />} />
                            <Route path="/run/:runId" element={<Thread />} />
                            <Route path="/event/:dealId" element={<EventPage />} />
                            <Route path="/r/:token" element={<RequestLink />} />
                            <Route path="/c/:id" element={<CommunityProfile />} />
                            <Route path="/add" element={<Add />} />
                            <Route path="/demo" element={<ReplayPage demo />} />
                            <Route path="/replay/:runId" element={<ReplayPage />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                        <Footer />
                      </div>
                    </TourProvider>
                  </NewRequestProvider>
                </NeedsYouProvider>
              </IdentityProvider>
            </PresenterProvider>
          </ProjectorProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
