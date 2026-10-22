import { findEvent } from "@/lib/workflow";
import { buildIcs } from "@/lib/ics";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ev = await findEvent(slug);
  if (!ev || (ev.status !== "published" && ev.status !== "cancelled")) return new Response("Not found", { status: 404 });
  const body = buildIcs([ev], await getSiteUrl(), ev.title);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}.ics"`,
    },
  });
}
