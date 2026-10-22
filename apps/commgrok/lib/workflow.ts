/*
 * =====================================================================================
 * WORKFLOW CONTRACT (shared by the workflow/API, organiser UI and public surface)
 * =====================================================================================
 * Roles: the public never logs in (calendar, event pages, guest RSVP). Every account is an
 * ORGANISER with a team. Organisers decide on bot proposals in /approvals.
 *
 * Statuses (lib/types.ts EventStatus):
 *   proposed       open, waiting for organiser decisions
 *   renegotiating  open, sent back to the bots with a note; waiting for a revised version
 *   rejected       final. Never public, can't be revised or decided again
 *   published      on the public calendar (published exactly once)
 *   cancelled      was published, then cancelled (public page shows "Cancelled")
 *   Legacy "changes_requested" is read as "renegotiating" (decision: "renegotiate").
 *
 * decide(eventId, decision, note, session, siteUrl?)
 *   decision: "approved" (Accept) | "rejected" (Reject) | "renegotiate" (Send back to bots)
 *   - Only OPEN events (proposed | renegotiating) can be decided, else 409.
 *   - session.teamId must be one of the event's required teams, else 403. (The team ALWAYS
 *     comes from the session, never the request body.)
 *   - renegotiate: note REQUIRED (trimmed length >= 3) else 400. reject: note optional.
 *   - Records an approvals row {decision, note, event_revision: current revision}.
 *   - Reject and renegotiate WIN over pending accepts:
 *       rejected    -> status "rejected" immediately (terminal), webhook event.rejected
 *       renegotiate -> status "renegotiating", webhook event.renegotiate (with the note)
 *   - approved -> evaluatePublish(): with REQUIRED_APPROVALS_MODE "all_teams", publish when
 *     every required team's latest decision FOR THE CURRENT REVISION is approved; with
 *     "any_organiser", one accept is enough. Publishing is a conditional update
 *     (only from an open status), so it happens exactly once; webhook event.published.
 *   - Returns { event, justPublished }.
 *   Log actions written: "approved" | "rejected" {note?} | "renegotiate" {note}
 *
 * reviseProposal(eventId, patch, actor = "Bot")
 *   - Bot sends a revised version (PUT /api/proposals/[id]). Allowed only when status is
 *     renegotiating or proposed; rejected/published/cancelled -> 409.
 *   - Bumps `revision` (which resets EVERY approval: approvals only count for the current
 *     revision), sets status back to "proposed".
 *   - Log action "revised", actor = actor, payload:
 *       { revision, fields: string[] (labels), changes: { [label]: { from, to } },
 *         note?: string  // the organiser note this revision responds to }
 *     The activity log shows "Revised by bot" with the small diff from payload.changes.
 *   Organiser inline edits (editEvent, PATCH /api/events/[id]) work the same way but log
 *   action "edited" with the same payload shape.
 *
 * Read helpers used by the UI:
 *   summarizeApprovals(...) rows[].state: "waiting" | "approved" | "rejected" | "renegotiate" | "stale"
 *   loadEventContext(ev) -> { teams, approval, rsvp, rsvps, log, latestNote: DecisionNote | null }
 *   loadInbox() -> Array<{ event, approval, going, latestNote: DecisionNote | null }>  (all except cancelled)
 *
 * Webhook: POST to EVENTS_WEBHOOK_URL (fallback alias PUBLISH_WEBHOOK_URL), JSON
 *   { type: "event.published" | "event.rejected" | "event.renegotiate",
 *     event: eventJson(...), note: string | null, decided_by: string | null, team: string | null }
 *   Each delivery is logged ("webhook" {type, status} or "webhook_failed").
 *
 * Bot API (X-API-Key = PROPOSALS_API_KEY, unchanged):
 *   POST /api/proposals                         create a proposal (unchanged)
 *   GET  /api/proposals?status=renegotiating    poll; each item = eventJson + latest_note
 *   PUT  /api/proposals/[id]                    revised proposal (partial event fields) -> reviseProposal
 *   GET  /api/events/[id]                       event + status + approvals.teams[] (state, note) + latest_note + rsvps
 * Organiser API (session cookie):
 *   POST /api/events/[id]/decision { decision, note? }
 * =====================================================================================
 */
// The approval workflow and publish rule. Every mutation in the app goes through here.
import { getStore, DuplicateError } from "./store";
import type { Session } from "./session";
import { notifyChange } from "./live-server";
import { slugify, type EventInput } from "./validation";
import { isPast } from "./time";
import { REQUIRED_APPROVALS_MODE } from "./config";
import { OPEN_STATUSES } from "./types";
import type {
  Approval,
  ApprovalSummary,
  Decision,
  DecisionNote,
  EventFields,
  EventRecord,
  EventSource,
  EventStatus,
  Rsvp,
  RsvpSummary,
  Team,
  TeamApprovalRow,
  WebhookType,
} from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const OPEN: EventStatus[] = OPEN_STATUSES;
export const isOpenStatus = (s: EventStatus) => OPEN.includes(s);
const FIELD_KEYS: (keyof EventFields)[] = [
  "title", "slug", "event_type", "communities", "description_md", "start_at", "end_at", "timezone",
  "venue_name", "venue_address", "online_url", "cover_url", "capacity", "price_label", "hosts", "visibility",
];
const FIELD_LABELS: Partial<Record<keyof EventFields, string>> = {
  description_md: "description", start_at: "start time", end_at: "end time", event_type: "type",
  venue_name: "venue", venue_address: "address", online_url: "online link", cover_url: "cover", price_label: "price",
};
const labelOf = (k: keyof EventFields) => FIELD_LABELS[k] ?? k;

// ---------- read helpers ----------

/** Latest decision per team, counting only approvals for the event's current revision. */
function latestByTeam(approvals: Approval[], revision?: number) {
  const m = new Map<string, Approval>();
  for (const a of [...approvals].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    if (revision === undefined || a.event_revision === revision) m.set(a.team_id, a);
  }
  return m;
}

export function summarizeApprovals(ev: EventRecord, teams: Team[], requiredTeamIds: string[], approvals: Approval[]): ApprovalSummary {
  const mine = approvals.filter((a) => a.event_id === ev.id);
  const current = latestByTeam(mine, ev.revision);
  const any = latestByTeam(mine);
  const rows: TeamApprovalRow[] = teams
    .filter((t) => requiredTeamIds.includes(t.id))
    .map((team) => {
      const cur = current.get(team.id);
      if (cur) return { team, state: cur.decision, approver_name: cur.approver_name, note: cur.note, at: cur.created_at };
      // Nothing for this revision yet. An accept of an older revision is "stale" (needs re-approval);
      // an older reject/renegotiate was answered by the revision, so the team is simply waiting again.
      const old = any.get(team.id);
      if (old?.decision === "approved") return { team, state: "stale", approver_name: old.approver_name, note: null, at: old.created_at };
      return { team, state: "waiting", approver_name: null, note: null, at: null };
    });
  return { rows, approved: rows.filter((r) => r.state === "approved").length, required: rows.length };
}

/**
 * The most recent organiser note: from the latest reject/renegotiate decision (any revision).
 * null when there is none, or when that latest decision was a reject without a note.
 */
export function latestDecisionNote(eventId: string, approvals: Approval[], teams: Team[]): DecisionNote | null {
  const notes = approvals
    .filter((a) => a.event_id === eventId && (a.decision === "rejected" || a.decision === "renegotiate"))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));
  const a = notes[0];
  if (!a || !a.note?.trim()) return null;
  return {
    decision: a.decision,
    note: a.note!.trim(),
    by: a.approver_name,
    team: teams.find((t) => t.id === a.team_id)?.name ?? null,
    at: a.created_at,
    revision: a.event_revision,
  };
}

export function summarizeRsvps(rsvps: Rsvp[]): RsvpSummary {
  const going = rsvps.filter((r) => r.status === "going");
  return {
    going: going.length,
    waitlist: rsvps.filter((r) => r.status === "waitlist").length,
    firstNames: going.slice(-8).reverse().map((r) => r.name.trim().split(/\s+/)[0]),
  };
}

export async function loadEventContext(ev: EventRecord) {
  const store = getStore();
  const [teams, required, approvals, rsvps, log] = await Promise.all([
    store.listTeams(),
    store.listRequiredTeams(ev.id),
    store.listApprovals(ev.id),
    store.listRsvps(ev.id),
    store.listLog(ev.id),
  ]);
  return {
    teams,
    approval: summarizeApprovals(ev, teams, required.map((r) => r.team_id), approvals),
    rsvp: summarizeRsvps(rsvps),
    rsvps,
    log: log.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    latestNote: latestDecisionNote(ev.id, approvals, teams),
  };
}

export async function findEvent(idOrSlug: string) {
  const store = getStore();
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  return (isUuid ? await store.getEvent(idOrSlug) : null) ?? (await store.getEventBySlug(idOrSlug));
}

export async function loadCalendar() {
  const store = getStore();
  const [events, rsvps] = await Promise.all([store.listEvents(), store.listRsvps()]);
  const now = Date.now();
  const rows = events
    .filter((e) => e.status === "published" && e.visibility === "public")
    .map((event) => ({ event, rsvp: summarizeRsvps(rsvps.filter((r) => r.event_id === event.id)) }));
  const upcoming = rows.filter((r) => !isPast(r.event.end_at, now)).sort((a, b) => a.event.start_at.localeCompare(b.event.start_at));
  const past = rows.filter((r) => isPast(r.event.end_at, now)).sort((a, b) => b.event.start_at.localeCompare(a.event.start_at));
  return { upcoming, past, all: rows.map((r) => r.event) };
}

/** Every event except cancelled ones (incl. rejected), with approval state and the latest organiser note. */
export async function loadInbox() {
  const store = getStore();
  const [events, teams, required, approvals, rsvps] = await Promise.all([
    store.listEvents(),
    store.listTeams(),
    store.listRequiredTeams(),
    store.listApprovals(),
    store.listRsvps(),
  ]);
  return events
    .filter((e) => e.status !== "cancelled")
    .map((event) => ({
      event,
      approval: summarizeApprovals(event, teams, required.filter((r) => r.event_id === event.id).map((r) => r.team_id), approvals),
      going: rsvps.filter((r) => r.event_id === event.id && r.status === "going").length,
      latestNote: latestDecisionNote(event.id, approvals, teams),
    }));
}

// ---------- mutations ----------

async function uniqueSlug(base: string, ignoreId?: string) {
  const store = getStore();
  const root = slugify(base) || "event";
  let slug = root;
  for (let i = 2; i < 50; i++) {
    const hit = await store.getEventBySlug(slug);
    if (!hit || hit.id === ignoreId) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createProposal(input: EventInput, source: EventSource, actor: string) {
  const store = getStore();
  const teams = await store.listTeams();
  const required = input.required_team_ids?.length
    ? input.required_team_ids.filter((id) => teams.some((t) => t.id === id))
    : teams.map((t) => t.id);
  if (!required.length) throw new HttpError(400, "No valid required teams");
  const slug = await uniqueSlug(input.slug || input.title);
  const fields: EventFields = {
    title: input.title,
    slug,
    event_type: input.event_type,
    communities: input.communities,
    description_md: input.description_md,
    start_at: new Date(input.start_at).toISOString(),
    end_at: new Date(input.end_at).toISOString(),
    timezone: input.timezone,
    venue_name: input.venue_name,
    venue_address: input.venue_address,
    online_url: input.online_url,
    cover_url: input.cover_url,
    capacity: input.capacity,
    price_label: input.price_label,
    hosts: input.hosts.map((h) => ({ name: h.name, avatar_url: h.avatar_url ?? null })),
    visibility: input.visibility,
  };
  const ev = await store.insertEvent(fields, source, required);
  await store.addLog({ event_id: ev.id, actor, action: "proposed", payload: { source } });
  await notifyChange(ev.id, "proposed");
  return ev;
}

async function requireEventForTeam(eventIdOrSlug: string, session: Session) {
  const store = getStore();
  const ev = await findEvent(eventIdOrSlug);
  if (!ev) throw new HttpError(404, "Event not found");
  const required = await store.listRequiredTeams(ev.id);
  if (!session.teamId || !required.some((r) => r.team_id === session.teamId)) throw new HttpError(403, "Your team isn't part of this event");
  const team = (await store.listTeams()).find((t) => t.id === session.teamId);
  if (!team) throw new HttpError(403, "Unknown team. Please re-join.");
  return { ev, team };
}

/** Human-readable value for the activity-log diff. */
function displayValue(k: keyof EventFields, v: unknown, tz: string): string | number | null {
  if (v == null || v === "") return null;
  if (k === "start_at" || k === "end_at") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(String(v)));
  }
  if (k === "hosts" && Array.isArray(v)) return v.map((h) => (h as { name: string }).name).join(", ") || null;
  if (Array.isArray(v)) return v.join(", ") || null;
  if (k === "description_md") {
    const s = String(v).replace(/\s+/g, " ").trim();
    return s.length > 90 ? `${s.slice(0, 89)}…` : s;
  }
  return typeof v === "number" ? v : String(v);
}

export type FieldChanges = Record<string, { from: string | number | null; to: string | number | null }>;

/**
 * Shared by organiser edits ("edited") and bot revisions ("revised"): applies the patch, bumps the
 * revision (which resets every approval), sets status back to "proposed" and logs
 * { revision, fields, changes: {label: {from, to}}, reset_teams, note?, message? }.
 */
async function applyRevision(
  ev: EventRecord,
  patch: Partial<EventFields>,
  opts: { actor: string; action: "edited" | "revised"; note?: string | null; message?: string | null; forceBump?: boolean },
) {
  const store = getStore();
  if (!OPEN.includes(ev.status)) throw new HttpError(409, `This event is ${ev.status} and can't be changed.`);
  patch = { ...patch };
  if (patch.start_at) patch.start_at = new Date(patch.start_at).toISOString();
  if (patch.end_at) patch.end_at = new Date(patch.end_at).toISOString();
  if (patch.slug && patch.slug !== ev.slug) {
    const hit = await store.getEventBySlug(patch.slug);
    if (hit && hit.id !== ev.id) throw new HttpError(409, "That link is already taken");
  }
  const changed = FIELD_KEYS.filter((k) => k in patch && JSON.stringify(patch[k] ?? null) !== JSON.stringify(ev[k] ?? null));
  if (!changed.length && !opts.forceBump) return { event: ev, changed: [] as string[], changes: {} as FieldChanges };
  const start = patch.start_at ?? ev.start_at;
  const end = patch.end_at ?? ev.end_at;
  if (new Date(end) < new Date(start)) throw new HttpError(400, "End must be after start");

  // Any change invalidates every earlier approval: nobody's yes covers something they didn't see.
  const ctx = await loadEventContext(ev);
  const resetTeams = ctx.approval.rows.filter((r) => r.state === "approved").map((r) => r.team.name);
  const clean: Partial<EventRecord> = {};
  const changes: FieldChanges = {};
  const tz = patch.timezone ?? ev.timezone;
  for (const k of changed) {
    (clean as Record<string, unknown>)[k] = patch[k];
    changes[labelOf(k)] = { from: displayValue(k, ev[k], ev.timezone), to: displayValue(k, patch[k], tz) };
  }
  const updated = await store.updateEvent(ev.id, { ...clean, revision: ev.revision + 1, status: "proposed" }, OPEN);
  if (!updated) throw new HttpError(409, "This event changed state. Refresh and try again.");
  const payload: Record<string, unknown> = {
    revision: updated.revision,
    fields: changed.map(labelOf),
    changes,
    reset_teams: resetTeams,
  };
  if (opts.note) payload.note = opts.note;
  if (opts.message) payload.message = opts.message;
  await store.addLog({ event_id: ev.id, actor: opts.actor, action: opts.action, payload });
  await notifyChange(ev.id, opts.action);
  return { event: updated, changed: changed.map(labelOf), changes };
}

/** Organiser inline edit (PATCH /api/events/[id]). */
export async function editEvent(eventId: string, patch: Partial<EventFields>, session: Session) {
  const { ev, team } = await requireEventForTeam(eventId, session);
  return applyRevision(ev, patch, { actor: `${session.name} (${team.name})`, action: "edited" });
}

/**
 * Bot sends a revised version (PUT /api/proposals/[id]). Only while open; rejected/published/cancelled -> 409.
 * The log payload `note` is the organiser note this revision responds to (if the event was renegotiating).
 */
export async function reviseProposal(eventIdOrSlug: string, patch: Partial<EventFields> & { message?: string }, actor = "Bot") {
  const store = getStore();
  const ev = await findEvent(eventIdOrSlug);
  if (!ev) throw new HttpError(404, "Event not found");
  if (!OPEN.includes(ev.status)) throw new HttpError(409, `This event is ${ev.status} and can't be revised.`);
  const { message, ...fields } = patch;
  const [approvals, teams] = await Promise.all([store.listApprovals(ev.id), store.listTeams()]);
  const latest = latestDecisionNote(ev.id, approvals, teams);
  // Only cite the note if it was made against the revision being replaced.
  const note = latest && latest.decision === "renegotiate" && latest.revision === ev.revision ? latest.note : null;
  const res = await applyRevision(ev, fields, {
    actor,
    action: "revised",
    note,
    message: message?.trim() || null,
    // Answering a renegotiation always produces a new revision (even "no changes, here's why").
    forceBump: ev.status === "renegotiating",
  });
  return { ...res, respondedTo: note };
}

export async function decide(
  eventId: string,
  decision: Decision,
  note: string | null | undefined,
  session: Session,
  siteUrl = "",
) {
  const store = getStore();
  const { ev, team } = await requireEventForTeam(eventId, session);
  if (!OPEN.includes(ev.status)) throw new HttpError(409, `This event is ${ev.status} and can't be decided.`);
  const cleanNote = note?.trim() || null;
  if (decision === "renegotiate" && (!cleanNote || cleanNote.length < 3)) {
    throw new HttpError(400, "Add a note so the bots know what to change");
  }
  const actor = `${session.name} (${team.name})`;

  const approvals = await store.listApprovals(ev.id);
  const mine = latestByTeam(approvals, ev.revision).get(team.id);
  const duplicateAccept = decision === "approved" && mine?.decision === "approved";
  if (!duplicateAccept) {
    await store.insertApproval({
      event_id: ev.id,
      team_id: team.id,
      approver_name: session.name,
      decision,
      note: cleanNote,
      event_revision: ev.revision,
    });
    await store.addLog({ event_id: ev.id, actor, action: decision, payload: cleanNote ? { note: cleanNote } : {} });
  }

  if (decision === "rejected" || decision === "renegotiate") {
    const next: EventStatus = decision === "rejected" ? "rejected" : "renegotiating";
    const updated = ev.status === next ? ev : await store.updateEvent(ev.id, { status: next }, OPEN);
    if (!updated) throw new HttpError(409, "This event changed state. Refresh and try again.");
    const type: WebhookType = decision === "rejected" ? "event.rejected" : "event.renegotiate";
    await fireWebhook(type, updated, siteUrl, { note: cleanNote, decided_by: session.name, team: team.name });
    await notifyChange(ev.id, decision);
    return { event: updated, justPublished: false };
  }

  const result = await evaluatePublish(ev.id, siteUrl, { decided_by: session.name, team: team.name });
  await notifyChange(ev.id, result.justPublished ? "published" : decision);
  return result;
}

/**
 * THE publish rule. Idempotent: the status flip is a conditional update (only from an open
 * status), so two simultaneous final approvals publish once, log once and fire the webhook once.
 * A standing reject/renegotiate for the current revision always blocks publishing.
 */
export async function evaluatePublish(eventId: string, siteUrl: string, by?: { decided_by: string | null; team: string | null }) {
  const store = getStore();
  const ev = await store.getEvent(eventId);
  if (!ev) throw new HttpError(404, "Event not found");
  if (!OPEN.includes(ev.status)) return { event: ev, justPublished: false };
  const [required, approvals] = await Promise.all([store.listRequiredTeams(eventId), store.listApprovals(eventId)]);
  const latest = latestByTeam(approvals, ev.revision);
  const decisions = required.map((r) => latest.get(r.team_id)?.decision);
  const blocked = decisions.some((d) => d === "rejected" || d === "renegotiate");
  const ready =
    !blocked &&
    required.length > 0 &&
    (REQUIRED_APPROVALS_MODE === "any_organiser" ? decisions.some((d) => d === "approved") : decisions.every((d) => d === "approved"));
  if (!ready) return { event: ev, justPublished: false };

  const published = await store.updateEvent(ev.id, { status: "published", published_at: new Date().toISOString() }, OPEN);
  if (!published) return { event: (await store.getEvent(ev.id))!, justPublished: false };
  await store.addLog({ event_id: ev.id, actor: "System", action: "published", payload: { url: `${siteUrl}/e/${published.slug}` } });
  await fireWebhook("event.published", published, siteUrl, { note: null, decided_by: by?.decided_by ?? null, team: by?.team ?? null });
  return { event: published, justPublished: true };
}

/** Cancel a published (or still open) event. Rejected -> 409; already cancelled is a no-op. */
export async function cancelEvent(eventId: string, session: Session) {
  const store = getStore();
  const { ev, team } = await requireEventForTeam(eventId, session);
  if (ev.status === "cancelled") return ev;
  // Only published events can be cancelled. Cancelled events are public, so cancelling an
  // open proposal would expose something nobody approved; reject it instead.
  const from: EventStatus[] = ["published"];
  if (!from.includes(ev.status)) throw new HttpError(409, `Only published events can be cancelled. This one is ${ev.status}; reject it instead.`);
  const updated = await store.updateEvent(ev.id, { status: "cancelled" }, from);
  if (!updated) throw new HttpError(409, "This event changed state. Refresh and try again.");
  await store.addLog({ event_id: ev.id, actor: `${session.name} (${team.name})`, action: "cancelled", payload: {} });
  await notifyChange(ev.id, "cancelled");
  return updated;
}

export async function registerRsvp(eventId: string, name: string, email: string) {
  const store = getStore();
  const ev = await store.getEvent(eventId);
  if (!ev || ev.status !== "published") throw new HttpError(404, "This event isn't open for registration");
  if (isPast(ev.end_at)) throw new HttpError(409, "This event has ended");
  const cleanEmail = email.trim().toLowerCase();
  const rsvps = await store.listRsvps(eventId);
  const existing = rsvps.find((r) => r.email === cleanEmail);
  if (existing && existing.status !== "cancelled") return { rsvp: existing, already: true };
  const going = rsvps.filter((r) => r.status === "going").length;
  const status = ev.capacity != null && going >= ev.capacity ? "waitlist" : "going";
  let rsvp: Rsvp;
  if (existing) {
    await store.updateRsvp(existing.id, { status, name: name.trim() });
    rsvp = { ...existing, status, name: name.trim() };
  } else {
    try {
      rsvp = await store.insertRsvp({ event_id: eventId, name: name.trim(), email: cleanEmail, status });
    } catch (e) {
      if (e instanceof DuplicateError) {
        const again = (await store.listRsvps(eventId)).find((r) => r.email === cleanEmail)!;
        return { rsvp: again, already: true };
      }
      throw e;
    }
  }
  await notifyChange(eventId, "rsvp");
  return { rsvp, already: false };
}

// ---------- JSON for the bot API and webhook ----------

export function absoluteUrl(siteUrl: string, pathOrUrl: string | null) {
  if (!pathOrUrl) return null;
  return pathOrUrl.startsWith("/") ? `${siteUrl}${pathOrUrl}` : pathOrUrl;
}

/**
 * Bot-facing JSON. `approvals` is included when an approval summary is passed, `rsvps` with an
 * RSVP summary, and `latest_note` (DecisionNote | null) whenever latestNote is not undefined.
 */
export function eventJson(
  ev: EventRecord,
  siteUrl: string,
  approval?: ApprovalSummary,
  rsvp?: RsvpSummary,
  latestNote?: DecisionNote | null,
) {
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    event_type: ev.event_type,
    communities: ev.communities,
    description_md: ev.description_md,
    start_at: ev.start_at,
    end_at: ev.end_at,
    timezone: ev.timezone,
    venue_name: ev.venue_name,
    venue_address: ev.venue_address,
    online_url: ev.online_url,
    cover_url: absoluteUrl(siteUrl, ev.cover_url),
    capacity: ev.capacity,
    price_label: ev.price_label,
    hosts: ev.hosts,
    visibility: ev.visibility,
    status: ev.status,
    revision: ev.revision,
    source: ev.source,
    published_at: ev.published_at,
    created_at: ev.created_at,
    updated_at: ev.updated_at,
    url: `${siteUrl}/e/${ev.slug}`,
    ics_url: `${siteUrl}/e/${ev.slug}/ics`,
    review_url: `${siteUrl}/approvals/${ev.id}`,
    ...(approval && {
      approvals: {
        mode: REQUIRED_APPROVALS_MODE,
        approved: approval.approved,
        required: approval.required,
        teams: approval.rows.map((r) => ({
          team_id: r.team.id,
          team_name: r.team.name,
          state: r.state,
          approver_name: r.approver_name,
          note: r.note,
          at: r.at,
        })),
      },
    }),
    ...(latestNote !== undefined && { latest_note: latestNote }),
    ...(rsvp && { rsvps: { going: rsvp.going, waitlist: rsvp.waitlist, spots_left: ev.capacity == null ? null : Math.max(0, ev.capacity - rsvp.going) } }),
  };
}

/** POST {type, event, note, decided_by, team} to EVENTS_WEBHOOK_URL (alias PUBLISH_WEBHOOK_URL). Each delivery is logged. */
async function fireWebhook(
  type: WebhookType,
  ev: EventRecord,
  siteUrl: string,
  meta: { note: string | null; decided_by: string | null; team: string | null },
) {
  const url = process.env.EVENTS_WEBHOOK_URL || process.env.PUBLISH_WEBHOOK_URL;
  if (!url) return;
  const store = getStore();
  try {
    const ctx = await loadEventContext(ev);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, event: eventJson(ev, siteUrl, ctx.approval, undefined, ctx.latestNote), ...meta }),
      signal: AbortSignal.timeout(5000),
    });
    await store.addLog({ event_id: ev.id, actor: "System", action: "webhook", payload: { type, status: res.status } });
  } catch (e) {
    await store.addLog({ event_id: ev.id, actor: "System", action: "webhook_failed", payload: { type, error: String(e) } });
  }
}
