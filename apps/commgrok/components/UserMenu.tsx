// Server component: reads the session. Do NOT import this from components/ui.tsx
// (ui.tsx is used by client components; this file uses next/headers).
// Logged out → "Organiser login" button. Logged in → "Approvals" button + avatar menu.
import Link from "next/link";
import { LogIn } from "lucide-react";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { btn } from "./ui";
import { UserMenuButton } from "./AuthForms";

export async function UserMenu({ next, compact }: { next?: string; compact?: boolean }) {
  const session = await getSession();
  if (!session) {
    const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    return (
      <Link href={href} className={btn.small}>
        <LogIn aria-hidden className="size-4" /> Organiser login
      </Link>
    );
  }
  const team = session.teamId ? (await getStore().listTeams()).find((t) => t.id === session.teamId) ?? null : null;
  return <UserMenuButton name={session.name} email={session.email} teamName={team?.name ?? null} compact={compact} />;
}
