import { findEvent } from "@/lib/workflow";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Team members only: guest list as CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const path = `/manage/${slug}/guests.csv`;
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!session.teamId) redirect(`/join?next=${encodeURIComponent(path)}`);
  const ev = await findEvent(slug);
  if (!ev) return new Response("Not found", { status: 404 });
  const rsvps = (await getStore().listRsvps(ev.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lines = [["name", "email", "status", "rsvp_at"], ...rsvps.map((r) => [r.name, r.email, r.status, r.created_at])];
  const body = lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}-guests.csv"`,
    },
  });
}
