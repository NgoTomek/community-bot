import type {
  Approval,
  EventFields,
  EventRecord,
  EventSource,
  EventStatus,
  LogEntry,
  RequiredTeam,
  Rsvp,
  RsvpStatus,
  Team,
} from "../types";

export class DuplicateError extends Error {}

/** App user (email + password login). Server-only: never send password_hash to the client. */
export interface User {
  id: string;
  /** Always lowercased; unique. */
  email: string;
  name: string;
  team_id: string | null;
  password_hash: string;
  created_at: string;
}

/** Storage backend. Implemented by the local JSON store and by Supabase. Server-only. */
export interface Store {
  mode: "local" | "supabase";
  listTeams(): Promise<Team[]>;
  listEvents(): Promise<EventRecord[]>;
  getEvent(id: string): Promise<EventRecord | null>;
  getEventBySlug(slug: string): Promise<EventRecord | null>;
  insertEvent(fields: EventFields, source: EventSource, requiredTeamIds: string[]): Promise<EventRecord>;
  /** Plain update. Pass onlyIfStatus to make it conditional (returns null when nothing matched). */
  updateEvent(
    id: string,
    patch: Partial<EventRecord>,
    onlyIfStatus?: EventStatus[],
  ): Promise<EventRecord | null>;
  listRequiredTeams(eventId?: string): Promise<RequiredTeam[]>;
  listApprovals(eventId?: string): Promise<Approval[]>;
  insertApproval(a: Omit<Approval, "id" | "created_at">): Promise<Approval>;
  listRsvps(eventId?: string): Promise<Rsvp[]>;
  insertRsvp(r: { event_id: string; name: string; email: string; status: RsvpStatus }): Promise<Rsvp>;
  updateRsvp(id: string, patch: Partial<Rsvp>): Promise<void>;
  listLog(eventId: string): Promise<LogEntry[]>;
  addLog(entry: { event_id: string; actor: string; action: string; payload?: Record<string, unknown> }): Promise<void>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  /** Throws DuplicateError when the email is taken. */
  insertUser(u: { email: string; name: string; team_id: string | null; password_hash: string }): Promise<User>;
  updateUser(id: string, patch: Partial<Pick<User, "name" | "team_id" | "password_hash">>): Promise<User | null>;
  /** Wipe and re-seed (local demo mode only). */
  reset?(): Promise<void>;
}
