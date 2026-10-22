import { dayOfWeek, isValidIsoDate } from "@community-bots/core";
import { DAY_NAMES } from "./constraints";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Thu 19 Nov" */
export function shortDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [, m, d] = iso.split("-").map(Number);
  return `${dayOfWeek(iso)} ${d} ${MONTHS[m - 1]}`;
}

/** "Thursday 19 November 2026" */
export function longDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAY_NAMES[dayOfWeek(iso)]} ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "just now", "4 min ago", "2 h ago", "3 days ago", or a date. */
export function relativeTime(timestamp: string, now: Date = new Date()): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  const date = new Date(then);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "18:30" from an ISO timestamp, in local time. */
export function clockTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "A", "A and B", "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
