import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/auth";
import { Header, Page } from "@/components/ui";
import { UserMenu } from "@/components/UserMenu";
import { JoinTeamForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose your team" };

/** Switch team, or (for team-less legacy accounts) pick one before reaching /approvals. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session] = await Promise.all([searchParams, getSession()]);
  const safe = safeNext(next, "");
  if (!session) redirect(`/login?next=${encodeURIComponent(safe || "/join")}`);
  const teams = await getStore().listTeams();
  return (
    <>
      <Header right={<UserMenu />} />
      <Page>
        <div className="pt-6">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{session.teamId ? "Switch team" : "Join your team"}</h1>
          <p className="mt-2 text-[15px] text-muted">
            Hi {session.name.split(" ")[0]}. Every organiser approves for one team. Pick yours.
          </p>
        </div>
        <JoinTeamForm teams={teams} current={session.teamId} next={safe || undefined} />
      </Page>
    </>
  );
}
