import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "../app/title";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "../components/ui/States";
import { useData } from "../data/DataProvider";
import { useLive } from "../data/hooks";
import { loadDemoReplay, loadRunReplay } from "../features/replay/load";
import { ReplayView } from "../features/replay/ReplayView";
import { truncate } from "../lib/format";

const DEMO_URL = `${import.meta.env.BASE_URL}demo-run.json`;

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>;
}

function ReplaySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the replay
      </p>
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <SkeletonCard />
      <SkeletonCard lines={2} />
    </div>
  );
}

/** /replay/:runId plays a run from the data source; /demo plays the bundled recording. */
export default function Replay({ demo = false }: { demo?: boolean }) {
  const { runId } = useParams();
  const source = useData();
  const key = demo ? "replay:demo" : runId ? `replay:${runId}` : null;
  const bundle = useLive(
    key,
    () => (demo ? loadDemoReplay(source, DEMO_URL, (url, init) => fetch(url, init)) : loadRunReplay(source, runId!)),
    { topics: [], poll: "never" },
  );
  const need = bundle.data?.data.run.need;
  usePageTitle(demo ? "Demo replay" : need ? `Replay: ${truncate(need, 48)}` : "Replay");

  if (bundle.loading) {
    return (
      <Page>
        <ReplaySkeleton />
      </Page>
    );
  }
  if (bundle.error && !bundle.data) {
    return (
      <Page>
        <ErrorState title="Could not load this replay" message={bundle.error} onRetry={bundle.reload} />
      </Page>
    );
  }
  if (!bundle.data) {
    return (
      <Page>
        <div className="card">
          <EmptyState
            icon={<SearchX size={28} aria-hidden />}
            title="This run does not exist"
            body="It may have been removed, or the link is incomplete."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/" className="btn">
                  Back to the board
                </Link>
                <Link to="/demo" className="btn btn-primary">
                  Watch the demo replay
                </Link>
              </div>
            }
          />
        </div>
      </Page>
    );
  }
  const { data } = bundle.data;
  return <ReplayView key={`${data.origin}:${data.run.id}`} bundle={bundle.data} demo={demo} />;
}
