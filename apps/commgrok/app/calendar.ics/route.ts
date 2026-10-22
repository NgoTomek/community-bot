import { loadCalendar } from "@/lib/workflow";
import { buildIcs } from "@/lib/ics";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The subscribable feed of every public, published event (webcal://host/calendar.ics). */
export async function GET() {
  const { all } = await loadCalendar();
  const body = buildIcs(all, await getSiteUrl());
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      // Short cache: URLs inside depend on the request host, and new events should show up quickly.
      "Cache-Control": "public, max-age=60",
      Vary: "Host",
    },
  });
}
