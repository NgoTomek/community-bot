import type { EventRecord } from "./types";

function location(ev: Pick<EventRecord, "venue_name" | "venue_address" | "online_url">) {
  return [ev.venue_name, ev.venue_address].filter(Boolean).join(", ") || ev.online_url || undefined;
}

export function googleCalendarUrl(ev: EventRecord, siteUrl: string) {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${f(ev.start_at)}/${f(ev.end_at)}`,
    details: `${siteUrl}/e/${ev.slug}`,
    location: location(ev) ?? "",
    ctz: ev.timezone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function mapsUrl(ev: Pick<EventRecord, "venue_name" | "venue_address">) {
  const q = [ev.venue_name, ev.venue_address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
