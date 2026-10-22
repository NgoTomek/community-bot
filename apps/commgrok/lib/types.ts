export const EVENT_TYPES = ["meetup", "talk", "workshop", "social", "hackathon", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type EventStatus = "proposed" | "renegotiating" | "rejected" | "published" | "cancelled";
/** Open = still being decided. Only open events accept decisions or revisions. */
export const OPEN_STATUSES: EventStatus[] = ["proposed", "renegotiating"];
export type Visibility = "public" | "unlisted";
/** approved = Accept, rejected = Reject (final), renegotiate = "Send back to bots" (note required). */
export type Decision = "approved" | "rejected" | "renegotiate";

// ---- Legacy data: "changes_requested" (old status + decision) now means "renegotiating"/"renegotiate".
export function normalizeStatus(s: string): EventStatus {
  return s === "changes_requested" ? "renegotiating" : (s as EventStatus);
}
export function normalizeDecision(d: string): Decision {
  return d === "changes_requested" ? "renegotiate" : (d as Decision);
}
export type RsvpStatus = "going" | "waitlist" | "cancelled";
export type EventSource = "bot" | "manual";

export interface Host {
  name: string;
  avatar_url?: string | null;
}

export interface Team {
  id: string;
  name: string;
  role: string | null;
  avatar_url: string | null;
}

/** The editable fields of an event (same shape as the bot payload). */
export interface EventFields {
  title: string;
  slug: string;
  event_type: EventType;
  communities: string[];
  description_md: string;
  start_at: string;
  end_at: string;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  cover_url: string | null;
  capacity: number | null;
  price_label: string;
  hosts: Host[];
  visibility: Visibility;
}

export interface EventRecord extends EventFields {
  id: string;
  status: EventStatus;
  source: EventSource;
  /** Bumped on every content edit. Approvals only count for the current revision. */
  revision: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  event_id: string;
  team_id: string;
  approver_name: string;
  decision: Decision;
  note: string | null;
  event_revision: number;
  created_at: string;
}

export interface Rsvp {
  id: string;
  event_id: string;
  name: string;
  email: string;
  status: RsvpStatus;
  created_at: string;
}

export interface LogEntry {
  id: string;
  event_id: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RequiredTeam {
  event_id: string;
  team_id: string;
}

/** Safe-to-show RSVP summary: counts and first names only, never emails. */
export interface RsvpSummary {
  going: number;
  waitlist: number;
  firstNames: string[];
}

/** Per-team state for the CURRENT revision. stale = accepted an earlier revision (needs re-approval). */
export type TeamApprovalState = "waiting" | "approved" | "rejected" | "renegotiate" | "stale";

/** The most recent organiser note (from a reject or renegotiate decision). */
export interface DecisionNote {
  decision: Decision;
  note: string;
  by: string;
  team: string | null;
  at: string;
  revision: number;
}

/** Webhook payload POSTed to EVENTS_WEBHOOK_URL (fallback PUBLISH_WEBHOOK_URL). */
export type WebhookType = "event.published" | "event.rejected" | "event.renegotiate";

export interface TeamApprovalRow {
  team: Team;
  state: TeamApprovalState;
  approver_name: string | null;
  note: string | null;
  at: string | null;
}

export interface ApprovalSummary {
  rows: TeamApprovalRow[];
  approved: number;
  required: number;
}
