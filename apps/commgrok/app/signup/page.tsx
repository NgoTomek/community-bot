import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { safeNext } from "@/lib/auth";
import { Header, Page } from "@/components/ui";
import { SignupForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create organiser account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session, teams] = await Promise.all([searchParams, getSession(), getStore().listTeams()]);
  const safe = safeNext(next, "");
  if (session) redirect(session.teamId ? safe || "/approvals" : `/join${safe ? `?next=${encodeURIComponent(safe)}` : ""}`);
  return (
    <>
      <Header />
      <Page>
        <div className="pt-6">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Create organiser account</h1>
          <p className="mt-2 text-[15px] text-muted">Organisers only. Guests don&apos;t need an account; just RSVP on any event.</p>
          <p className="mt-1.5 text-[15px] text-muted">Pick the team you approve for. Events go live only when every team involved has said yes.</p>
        </div>
        <SignupForm teams={teams} next={safe || undefined} />
      </Page>
    </>
  );
}
