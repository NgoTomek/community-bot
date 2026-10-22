import type { Deal } from "./schemas";

const DEFAULT_DURATION_MIN = 120;

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds content lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** End time: 30 minutes after the last agenda item if that is later than the start, else start + 2h. */
export function dealEndMinutes(deal: Deal): number {
  const start = toMinutes(deal.time) ?? 18 * 60;
  const lastItem = deal.agenda.map((a) => toMinutes(a.time)).filter((m): m is number => m !== null && m > start);
  return lastItem.length ? Math.max(...lastItem) + 30 : start + DEFAULT_DURATION_MIN;
}

function localStamp(date: string, minutes: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, minutes));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`;
}

/**
 * An .ics calendar file for the deal. Times are "floating" (no time zone): the event happens
 * at the stated local time wherever the venue is.
 */
export function buildIcs(deal: Deal, opts: { uid: string; url?: string; confirmed?: boolean; now?: Date }): string {
  const start = toMinutes(deal.time) ?? 18 * 60;
  const now = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const hosts = deal.communities.map((c) => c.name).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Community Bots//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@community-bots`,
    `DTSTAMP:${now}`,
    `DTSTART:${localStamp(deal.date, start)}`,
    `DTEND:${localStamp(deal.date, dealEndMinutes(deal))}`,
    `SUMMARY:${escapeText(deal.title)}`,
    `DESCRIPTION:${escapeText(`${deal.description}\n\nHosted by ${hosts}.${opts.url ? `\n${opts.url}` : ""}`)}`,
    `LOCATION:${escapeText(deal.venue)}`,
    ...(opts.url ? [`URL:${opts.url}`] : []),
    `STATUS:${opts.confirmed ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
