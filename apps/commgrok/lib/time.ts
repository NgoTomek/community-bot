// Timezone helpers. Every date is shown in the event's timezone (default Europe/London)
// so server and client render identical strings.

export const DEFAULT_TZ = "Europe/London";

const pad = (n: number) => String(n).padStart(2, "0");

function partsInTz(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    min: Number(p.minute),
    s: Number(p.second),
  };
}

function tzOffsetMs(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** "2026-10-23T18:30" (wall time in tz) -> Date (UTC instant). */
export function zonedToUtc(local: string, tz: string = DEFAULT_TZ): Date {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  const off = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off) utc = guess - off2;
  return new Date(utc);
}

/** ISO -> "YYYY-MM-DDTHH:mm" in tz, for <input type="datetime-local">. */
export function toZonedInput(iso: string, tz: string = DEFAULT_TZ): string {
  const p = partsInTz(new Date(iso), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** "YYYY-MM-DD" for grouping by day in tz. */
export function dayKey(iso: string | Date, tz: string = DEFAULT_TZ): string {
  const p = partsInTz(typeof iso === "string" ? new Date(iso) : iso, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso));
}

export const monthShort = (iso: string, tz = DEFAULT_TZ) => fmt(iso, tz, { month: "short" }).toUpperCase();
export const dayNum = (iso: string, tz = DEFAULT_TZ) => fmt(iso, tz, { day: "numeric" });
export const weekdayLong = (iso: string, tz = DEFAULT_TZ) => fmt(iso, tz, { weekday: "long" });
export const longDate = (iso: string, tz = DEFAULT_TZ) =>
  fmt(iso, tz, { weekday: "long", day: "numeric", month: "long" });
export const shortDate = (iso: string, tz = DEFAULT_TZ) =>
  fmt(iso, tz, { weekday: "short", day: "numeric", month: "short" });
export const timeOf = (iso: string, tz = DEFAULT_TZ) =>
  fmt(iso, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function timeRange(startIso: string, endIso: string, tz = DEFAULT_TZ) {
  const sameDay = dayKey(startIso, tz) === dayKey(endIso, tz);
  return sameDay
    ? `${timeOf(startIso, tz)} – ${timeOf(endIso, tz)}`
    : `${timeOf(startIso, tz)} – ${shortDate(endIso, tz)}, ${timeOf(endIso, tz)}`;
}

/** Short zone label such as "BST" or "GMT". */
export function zoneLabel(iso: string, tz = DEFAULT_TZ) {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

/** "Today", "Tomorrow" or "Thu 23 Oct". */
export function dayHeading(iso: string, tz = DEFAULT_TZ, now = new Date()) {
  const k = dayKey(iso, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(new Date(now.getTime() + 86_400_000), tz)) return "Tomorrow";
  if (k === dayKey(new Date(now.getTime() - 86_400_000), tz)) return "Yesterday";
  return shortDate(iso, tz);
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return "just now";
  const mins = Math.round(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export const isPast = (endIso: string, now = Date.now()) => new Date(endIso).getTime() < now;
