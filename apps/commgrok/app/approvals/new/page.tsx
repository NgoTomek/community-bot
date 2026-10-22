import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTeamPage } from "@/lib/auth";
import { UserMenu } from "@/components/UserMenu";
import { EventEditor } from "@/components/EventEditor";
import { Header, Page } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "New proposal" };

export default async function NewProposal() {
  await requireTeamPage("/approvals/new");
  return (
    <>
      <Header right={<UserMenu />} />
      <Page>
        <Link href="/approvals" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Approvals
        </Link>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">New proposal</h1>
        <p className="mb-6 mt-2 text-[15px] text-muted">Same fields as the bot sends. Both teams approve before it goes live.</p>
        <EventEditor mode={{ kind: "create" }} />
      </Page>
    </>
  );
}
