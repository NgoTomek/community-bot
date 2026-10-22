// Page-level auth helpers (server components). Redirect instead of throwing.
import { redirect } from "next/navigation";
import { getSession, type Session } from "./session";

/** Only same-site relative paths: starts with "/" and not "//" (or "/\\"). */
export function safeNext(next: unknown, fallback: string): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Where an organiser lands after login/signup when there is no `next`. Team-less legacy users pick a team first. */
export function defaultRedirect(teamId: string | null) {
  return teamId ? "/approvals" : "/join";
}

/** Logged-in user (any). Logged out → /login?next=path. */
export async function requireUserPage(path: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(path)}`);
  return s;
}

/** Logged-in organiser on a team. Logged out → /login?next=path, team-less legacy account → /join?next=path. */
export async function requireTeamPage(path: string): Promise<Session & { teamId: string }> {
  const s = await requireUserPage(path);
  if (!s.teamId) redirect(`/join?next=${encodeURIComponent(path)}`);
  return s as Session & { teamId: string };
}
