import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Footer, Header } from "./product/Shell";
import { BackendProvider, PasscodeProvider, PresentSync } from "./product/session";
import Add from "./pages/Add";
import Community from "./pages/Community";
import EventPage from "./pages/Event";
import Home from "./pages/Home";
import HowItWorks from "./pages/HowItWorks";
import NotFound from "./pages/NotFound";
import ReplayPage from "./pages/Replay";
import Request from "./pages/Request";
import Run from "./pages/Run";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <PresentSync />
      <PasscodeProvider>
        <BackendProvider>
          <div className="app-shell">
            <a className="skip" href="#content">
              Skip to content
            </a>
            <Header />
            <main id="content" tabIndex={-1}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/add" element={<Add />} />
                <Route path="/c/:id" element={<Community />} />
                <Route path="/c/:id/request" element={<Request />} />
                <Route path="/run/:runId" element={<Run />} />
                <Route path="/event/:dealId" element={<EventPage />} />
                <Route path="/replay/:runId" element={<ReplayPage />} />
                <Route path="/demo" element={<ReplayPage demo />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BackendProvider>
      </PasscodeProvider>
    </BrowserRouter>
  );
}
