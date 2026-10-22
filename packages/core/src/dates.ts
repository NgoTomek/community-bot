import { DAYS, type Day } from "./schemas";

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date (YYYY-MM-DD) from the system clock, in the machine's local time zone. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Day of week for a YYYY-MM-DD date, independent of time zone. */
export function dayOfWeek(iso: string): Day {
  const [y, m, d] = iso.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return DAYS[(jsDay + 6) % 7];
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Days allowed by every community. A community with an empty `days` list has no known
 * restriction. Returns all seven days when nobody restricts, [] when nothing overlaps.
 */
export function allowedDaysForAll(dayLists: Day[][]): Day[] {
  return DAYS.filter((day) => dayLists.every((days) => days.length === 0 || days.includes(day)));
}

/** First date on or after `fromIso` whose weekday is in `allowed`, or null if `allowed` is empty. */
export function nextAllowedDate(fromIso: string, allowed: Day[]): string | null {
  if (allowed.length === 0) return null;
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(fromIso, i);
    if (allowed.includes(dayOfWeek(candidate))) return candidate;
  }
  return null;
}

/** "Thu 19 Nov 2026" for display. */
export function formatDisplayDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${dayOfWeek(iso)} ${d} ${months[m - 1]} ${y}`;
}
