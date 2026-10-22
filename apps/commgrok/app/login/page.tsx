import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/auth";
import { Header, Page } from "@/components/ui";
import { LoginForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organiser login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, session] = await Promise.all([searchParams, getSession()]);
  const safe = safeNext(next, "");
  if (session) redirect(session.teamId ? safe || "/approvals" : `/join${safe ? `?next=${encodeURIComponent(safe)}` : ""}`);
  return (
    <>
      <Header />
      <Page>
        <div className="pt-6">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Organiser login</h1>
          <p className="mt-2 text-[15px] text-muted">
            For organisers who review and approve events. Guests don&apos;t need an account; just RSVP on any event.
          </p>
        </div>
        <LoginForm next={safe || undefined} />
      </Page>
    </>
  );
}
