// Supabase store. Server-only: uses the service role key, so RLS is bypassed here
// and access rules are enforced in the server routes (see lib/workflow.ts).
// Behaviour mirrors lib/store/local.ts method for method; reset() re-seeds from the same buildSeed().
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Approval, EventRecord, LogEntry, RequiredTeam, Rsvp, Team } from "../types";
import { normalizeDecision, normalizeStatus } from "../types";
import { buildSeed } from "./local";
import { DuplicateError, type Store, type User } from "./types";

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Never let Next.js cache a store read.
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return client;
}

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === "23505") throw new DuplicateError(res.error.message);
    throw new Error(`Supabase: ${res.error.message}`);
  }
  return res.data as T;
}

// Every id column is a uuid: a non-uuid lookup would be a Postgres error (22P02), the local store just finds nothing.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined | null): v is string => typeof v === "string" && UUID_RE.test(v);

// timestamptz comes back as "2026-10-22T18:30:00.123+00:00"; the app (and the local store) use
// Date#toISOString() ("...Z"), and workflow.ts compares and sorts these strings directly.
const ts = (v: string) => new Date(v).toISOString();
const tsN = (v: string | null | undefined) => (v ? ts(v) : null);

// Legacy rows ("changes_requested") read as "renegotiating" / "renegotiate".
function normEv(e: EventRecord): EventRecord;
function normEv(e: EventRecord | null): EventRecord | null;
function normEv(e: EventRecord | null): EventRecord | null {
  if (!e) return null;
  return {
    ...e,
    status: normalizeStatus(e.status),
    communities: e.communities ?? [],
    hosts: Array.isArray(e.hosts) ? e.hosts : [],
    start_at: ts(e.start_at),
    end_at: ts(e.end_at),
    published_at: tsN(e.published_at),
    created_at: ts(e.created_at),
    updated_at: ts(e.updated_at),
  };
}
const evs = (rows: EventRecord[]) => rows.map((e) => normEv(e));
const ap = (a: Approval): Approval => ({ ...a, decision: normalizeDecision(a.decision), created_at: ts(a.created_at) });
const rv = (r: Rsvp): Rsvp => ({ ...r, created_at: ts(r.created_at) });
const lg = (l: LogEntry): LogEntry => ({ ...l, payload: l.payload ?? {}, created_at: ts(l.created_at) });
const us = (u: User | null): User | null => (u ? { ...u, created_at: ts(u.created_at) } : null);

/** supabase-js sends one HTTP request per insert: keep the batches modest. */
async function insertBatched(table: string, rows: object[], size = 200) {
  for (let i = 0; i < rows.length; i += size) check(await db().from(table).insert(rows.slice(i, i + size)));
}

export const supabaseStore: Store = {
  mode: "supabase",
  async listTeams() {
    return check<Team[]>(await db().from("teams").select("id,name,role,avatar_url").order("name"));
  },
  async listEvents() {
    return evs(check<EventRecord[]>(await db().from("events").select("*").order("start_at")));
  },
  async getEvent(id) {
    if (!isUuid(id)) return null;
    return normEv(check<EventRecord | null>(await db().from("events").select("*").eq("id", id).maybeSingle()));
  },
  async getEventBySlug(slug) {
    return normEv(check<EventRecord | null>(await db().from("events").select("*").eq("slug", slug).maybeSingle()));
  },
  async insertEvent(fields, source, requiredTeamIds) {
    const ev = normEv(
      check<EventRecord>(
        await db().from("events").insert({ ...fields, source, status: "proposed", revision: 1, published_at: null }).select("*").single(),
      ),
    );
    if (requiredTeamIds.length) {
      check(await db().from("event_required_teams").insert(requiredTeamIds.map((team_id) => ({ event_id: ev.id, team_id }))));
    }
    return ev;
  },
  async updateEvent(id, patch, onlyIfStatus) {
    if (!isUuid(id)) return null;
    // Conditional update: the status filter runs in the same UPDATE, so only one caller can win
    // a transition (this is what makes publishing exactly-once). No row back = nothing matched.
    let q = db().from("events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (onlyIfStatus) q = q.in("status", onlyIfStatus);
    const rows = check<EventRecord[]>(await q.select("*"));
    return rows[0] ? normEv(rows[0]) : null;
  },
  async listRequiredTeams(eventId) {
    if (eventId !== undefined && !isUuid(eventId)) return [];
    let q = db().from("event_required_teams").select("event_id,team_id");
    if (eventId) q = q.eq("event_id", eventId);
    return check<RequiredTeam[]>(await q);
  },
  async listApprovals(eventId) {
    if (eventId !== undefined && !isUuid(eventId)) return [];
    let q = db().from("approvals").select("*").order("created_at");
    if (eventId) q = q.eq("event_id", eventId);
    return check<Approval[]>(await q).map(ap);
  },
  async insertApproval(a) {
    return ap(check<Approval>(await db().from("approvals").insert(a).select("*").single()));
  },
  async listRsvps(eventId) {
    if (eventId !== undefined && !isUuid(eventId)) return [];
    let q = db().from("rsvps").select("*").order("created_at");
    if (eventId) q = q.eq("event_id", eventId);
    return check<Rsvp[]>(await q).map(rv);
  },
  async insertRsvp(r) {
    // unique (event_id, email) -> 23505 -> DuplicateError, like the local store.
    return rv(check<Rsvp>(await db().from("rsvps").insert(r).select("*").single()));
  },
  async updateRsvp(id, patch) {
    if (!isUuid(id)) return;
    check(await db().from("rsvps").update(patch).eq("id", id));
  },
  async listLog(eventId) {
    if (!isUuid(eventId)) return [];
    return check<LogEntry[]>(await db().from("event_log").select("*").eq("event_id", eventId).order("created_at")).map(lg);
  },
  async addLog(entry) {
    check(await db().from("event_log").insert({ ...entry, payload: entry.payload ?? {} }));
  },
  async getUserByEmail(email) {
    return us(check<User | null>(await db().from("users").select("*").eq("email", email.trim().toLowerCase()).maybeSingle()));
  },
  async getUserById(id) {
    if (!isUuid(id)) return null;
    return us(check<User | null>(await db().from("users").select("*").eq("id", id).maybeSingle()));
  },
  async insertUser(u) {
    // users.email is unique -> 23505 -> DuplicateError.
    return us(check<User>(await db().from("users").insert({ ...u, email: u.email.trim().toLowerCase() }).select("*").single()))!;
  },
  async updateUser(id, patch) {
    if (!isUuid(id)) return null;
    const rows = check<User[]>(await db().from("users").update(patch).eq("id", id).select("*"));
    return us(rows[0] ?? null);
  },
  /**
   * Wipe and re-seed with the same data as local mode (buildSeed(), dates relative to today).
   * Like local mode, accounts people created during the demo are kept; the demo users are restored.
   * Not atomic: if a step fails, run it again.
   */
  async reset() {
    const seed = buildSeed();
    const c = db();
    // supabase-js refuses a DELETE without a filter. Children first (they'd cascade anyway).
    for (const table of ["event_log", "rsvps", "approvals", "event_required_teams"]) {
      check(await c.from(table).delete().not("event_id", "is", null));
    }
    check(await c.from("events").delete().not("id", "is", null));
    // Teams: upsert the seed teams (keeps users.team_id intact), drop any others.
    check(await c.from("teams").upsert(seed.teams, { onConflict: "id" }));
    check(await c.from("teams").delete().not("id", "in", `(${seed.teams.map((t) => t.id).join(",")})`));
    // Demo users back to their seed state; other accounts are kept.
    check(await c.from("users").delete().in("email", seed.users.map((u) => u.email)));
    check(await c.from("users").delete().in("id", seed.users.map((u) => u.id)));
    await insertBatched("users", seed.users);
    await insertBatched("events", seed.events);
    await insertBatched("event_required_teams", seed.required);
    await insertBatched("approvals", seed.approvals);
    await insertBatched("rsvps", seed.rsvps);
    await insertBatched("event_log", seed.log);
  },
};
