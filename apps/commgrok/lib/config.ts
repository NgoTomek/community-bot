// Branding and runtime mode. Change the names here.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "CommGrok";
export const CALENDAR_NAME = process.env.NEXT_PUBLIC_CALENDAR_NAME || "London Community Calendar";
export const CALENDAR_DESCRIPTION =
  "Meetups, talks, workshops and socials from London's builder communities. Every event is approved by the people who host it.";
export const THEME_COLOR = "#7c3aed";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Server-only: true when Supabase is configured, otherwise we run on the local JSON store. */
export function isSupabaseMode() {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Who must accept before an event publishes.
 * all_teams (default): every required team accepts the current revision.
 * any_organiser: one accept from any organiser publishes.
 */
export type ApprovalMode = "all_teams" | "any_organiser";
export const REQUIRED_APPROVALS_MODE: ApprovalMode =
  process.env.NEXT_PUBLIC_APPROVAL_MODE === "any_organiser" ? "any_organiser" : "all_teams";

/** Invite code needed to create an organiser account. */
export const ORGANISER_INVITE_CODE = process.env.ORGANISER_INVITE_CODE || "commgrok";

export const LIVE_CHANNEL = "community-events-live";
