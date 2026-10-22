import { Header, Page, Skel } from "@/components/ui";

// Approvals inbox skeleton: title, team line, tabs, proposal cards.
export default function Loading() {
  return (
    <>
      <Header />
      <Page>
        <div role="status" aria-label="Loading approvals">
          <div className="pb-5 pt-4">
            <Skel className="h-8 w-40" />
            <Skel className="mt-2.5 h-5 w-52" />
          </div>
          <Skel className="h-12 w-full" />
          <div className="mt-5 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 rounded-2xl border border-line bg-card p-3">
                <Skel className="size-[72px] shrink-0" />
                <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                  <Skel className="h-3.5 w-1/2" />
                  <Skel className="h-4.5 w-11/12" />
                  <div className="flex gap-2 pt-0.5">
                    <Skel className="h-5 w-16 rounded-full" />
                    <Skel className="h-5 w-28 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <span className="sr-only">Loading…</span>
        </div>
      </Page>
    </>
  );
}
