import { createEvents, type EventAttributes } from "ics";
import type { EventRecord } from "./types";
import { CALENDAR_NAME, APP_NAME } from "./config";

function location(ev: EventRecord) {
  return [ev.venue_name, ev.venue_address].filter(Boolean).join(", ") || ev.online_url || undefined;
}

function toAttrs(ev: EventRecord, siteUrl: string): EventAttributes {
  const url = `${siteUrl}/e/${ev.slug}`;
  return {
    uid: `${ev.id}@community-bot`,
    start: new Date(ev.start_at).getTime(),
    startInputType: "utc",
    startOutputType: "utc",
    end: new Date(ev.end_at).getTime(),
    endInputType: "utc",
    endOutputType: "utc",
    title: ev.title,
    description: `${ev.description_md.replace(/[*_#>`]/g, "").slice(0, 1500)}\n\n${url}`,
    location: location(ev),
    url,
    status: ev.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
    categories: [ev.event_type, ...ev.communities],
    lastModified: new Date(ev.updated_at).getTime(),
  };
}

export function buildIcs(events: EventRecord[], siteUrl: string, calName = CALENDAR_NAME) {
  const { error, value } = createEvents(
    events.map((e) => toAttrs(e, siteUrl)),
    { productId: `${APP_NAME}/community-bot`, calName, method: "PUBLISH" },
  );
  if (error || !value) throw error ?? new Error("Could not build calendar file");
  return value;
}

