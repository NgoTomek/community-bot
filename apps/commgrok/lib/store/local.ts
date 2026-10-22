// Local demo store: a JSON file in .data/db.json. Zero setup, works offline,
// survives restarts. Every write bumps `version`, which /api/live watches.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SEED_EVENTS, SEED_PEOPLE, SEED_TEAMS, SEED_USERS } from "../seed-data";
import { hashPassword } from "../password";
import { DEFAULT_TZ, dayKey, zonedToUtc } from "../time";
import type { Approval, EventRecord, LogEntry, RequiredTeam, Rsvp, Team } from "../types";
import { normalizeDecision, normalizeStatus } from "../types";
import { DuplicateError, type Store, type User } from "./types";

interface Db {
  version: number;
  teams: Team[];
  events: EventRecord[];
  required: RequiredTeam[];
  approvals: Approval[];
  rsvps: Rsvp[];
  log: LogEntry[];
  users: User[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type Cache = { db: Db; mtimeMs: number };
const g = globalThis as unknown as { __cbLocalDb?: Cache };

function addDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function seedUsers(): User[] {
  const created = new Date().toISOString();
  return SEED_USERS.map((u) => ({
    id: u.id,
    email: u.email.toLowerCase(),
    name: u.name,
    team_id: u.team_id,
    password_hash: hashPassword(u.password),
    created_at: created,
  }));
}

export function buildSeed(): Db {
  const now = Date.now();
  const today = dayKey(new Date(), DEFAULT_TZ);
  const db: Db = { version: 1, teams: SEED_TEAMS.map((t) => ({ ...t })), events: [], required: [], approvals: [], rsvps: [], log: [], users: seedUsers() };
  let personIdx = 0;
  for (const s of SEED_EVENTS) {
    let day = addDays(today, s.day_offset);
    if (s.weekday !== undefined) {
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      day = addDays(day, (s.weekday - dow + 7) % 7);
    }
    const created = new Date(now - s.created_days_ago * 86_400_000 - 3_600_000).toISOString();
    const start = zonedToUtc(`${day}T${s.start_time}`, DEFAULT_TZ).toISOString();
    const end = zonedToUtc(`${day}T${s.end_time}`, DEFAULT_TZ).toISOString();
    const ev: EventRecord = {
      id: s.id,
      slug: s.slug,
      title: s.title,
      event_type: s.event_type,
      communities: s.communities,
      description_md: s.description_md,
      start_at: start,
      end_at: end,
      timezone: DEFAULT_TZ,
      venue_name: s.venue_name,
      venue_address: s.venue_address,
      online_url: s.online_url,
      cover_url: s.cover_url,
      capacity: s.capacity,
      price_label: s.price_label,
      hosts: s.hosts,
      visibility: "public",
      status: s.status,
      source: s.source,
      revision: 1,
      published_at: s.status === "published" ? new Date(new Date(created).getTime() + 7_200_000).toISOString() : null,
      created_at: created,
      updated_at: created,
    };
    db.events.push(ev);
    db.log.push({ id: randomUUID(), event_id: ev.id, actor: s.source === "bot" ? "Community bot" : "Tom Adeyemi", action: "proposed", payload: {}, created_at: created });
    for (const t of SEED_TEAMS) db.required.push({ event_id: ev.id, team_id: t.id });
    s.approvals.forEach((a, i) => {
      const at = new Date(new Date(created).getTime() + (i + 1) * 1_800_000).toISOString();
      db.approvals.push({ id: randomUUID(), event_id: ev.id, team_id: a.team_id, approver_name: a.approver_name, decision: a.decision, note: a.note, event_revision: 1, created_at: at });
      const team = SEED_TEAMS.find((t) => t.id === a.team_id)!;
      db.log.push({ id: randomUUID(), event_id: ev.id, actor: `${a.approver_name} (${team.name})`, action: a.decision, payload: a.note ? { note: a.note } : {}, created_at: at });
    });
    if (ev.published_at) {
      db.log.push({ id: randomUUID(), event_id: ev.id, actor: "System", action: "published", payload: {}, created_at: ev.published_at });
    }
    const addRsvps = (n: number, status: "going" | "waitlist") => {
      for (let i = 0; i < n; i++) {
        const name = SEED_PEOPLE[personIdx++ % SEED_PEOPLE.length];
        db.rsvps.push({
          id: randomUUID(),
          event_id: ev.id,
          name,
          email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
          status,
          created_at: new Date(now - (n - i) * 3_000_000).toISOString(),
        });
      }
    };
    addRsvps(s.going, "going");
    addRsvps(s.waitlist, "waitlist");
  }
  return db;
}

function persist(db: Db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  // Windows can briefly lock the target (antivirus, a concurrent reader): retry, then fall back to copy.
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, DB_FILE);
      break;
    } catch (e) {
      if (i >= 4) {
        fs.copyFileSync(tmp, DB_FILE);
        fs.rmSync(tmp, { force: true });
        break;
      }
      void e;
    }
  }
  g.__cbLocalDb = { db, mtimeMs: fs.statSync(DB_FILE).mtimeMs };
}

function readDb(): Db {
  const st = fs.statSync(DB_FILE);
  if (g.__cbLocalDb && g.__cbLocalDb.mtimeMs === st.mtimeMs) return g.__cbLocalDb.db;
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Db;
  // Legacy "changes_requested" -> "renegotiating" / "renegotiate".
  for (const e of db.events) e.status = normalizeStatus(e.status);
  for (const a of db.approvals) a.decision = normalizeDecision(a.decision);
  if (!Array.isArray(db.users)) {
    // Older db.json (before accounts existed): backfill the demo users.
    db.users = seedUsers();
    persist(db);
    return db;
  }
  g.__cbLocalDb = { db, mtimeMs: st.mtimeMs };
  return db;
}

function load(): Db {
  try {
    return readDb();
  } catch (e) {
    // Only seed when the file genuinely doesn't exist. Never wipe live data on a transient read error.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      const db = buildSeed();
      persist(db);
      return db;
    }
    try {
      return readDb();
    } catch (e2) {
      if (g.__cbLocalDb) return g.__cbLocalDb.db;
      throw e2;
    }
  }
}

function write(mutator: (db: Db) => void) {
  const db = load();
  mutator(db);
  db.version += 1;
  persist(db);
}

/** Used by /api/live to detect changes, even across processes. */
export function localVersion(): number {
  try {
    return load().version;
  } catch {
    return 0;
  }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();

export const localStore: Store = {
  mode: "local",
  async listTeams() {
    return clone(load().teams);
  },
  async listEvents() {
    return clone(load().events);
  },
  async getEvent(id) {
    const e = load().events.find((x) => x.id === id);
    return e ? clone(e) : null;
  },
  async getEventBySlug(slug) {
    const e = load().events.find((x) => x.slug === slug);
    return e ? clone(e) : null;
  },
  async insertEvent(fields, source, requiredTeamIds) {
    const t = nowIso();
    const ev: EventRecord = { ...fields, id: randomUUID(), status: "proposed", source, revision: 1, published_at: null, created_at: t, updated_at: t };
    write((db) => {
      if (db.events.some((e) => e.slug === ev.slug)) throw new DuplicateError("slug already exists");
      db.events.push(ev);
      for (const team_id of requiredTeamIds) db.required.push({ event_id: ev.id, team_id });
    });
    return clone(ev);
  },
  async updateEvent(id, patch, onlyIfStatus) {
    let out: EventRecord | null = null;
    const db = load();
    const ev = db.events.find((e) => e.id === id);
    if (!ev) return null;
    if (onlyIfStatus && !onlyIfStatus.includes(ev.status)) return null;
    if (patch.slug && patch.slug !== ev.slug && db.events.some((e) => e.slug === patch.slug)) throw new DuplicateError("slug already exists");
    write((d) => {
      const target = d.events.find((e) => e.id === id)!;
      Object.assign(target, patch, { updated_at: nowIso() });
      out = clone(target);
    });
    return out;
  },
  async listRequiredTeams(eventId) {
    const r = load().required;
    return clone(eventId ? r.filter((x) => x.event_id === eventId) : r);
  },
  async listApprovals(eventId) {
    const a = load().approvals;
    return clone(eventId ? a.filter((x) => x.event_id === eventId) : a);
  },
  async insertApproval(a) {
    const row: Approval = { ...a, id: randomUUID(), created_at: nowIso() };
    write((db) => void db.approvals.push(row));
    return clone(row);
  },
  async listRsvps(eventId) {
    const r = load().rsvps;
    return clone(eventId ? r.filter((x) => x.event_id === eventId) : r);
  },
  async insertRsvp(r) {
    const row: Rsvp = { ...r, id: randomUUID(), created_at: nowIso() };
    write((db) => {
      if (db.rsvps.some((x) => x.event_id === r.event_id && x.email === r.email)) throw new DuplicateError("already registered");
      db.rsvps.push(row);
    });
    return clone(row);
  },
  async updateRsvp(id, patch) {
    write((db) => {
      const r = db.rsvps.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  },
  async listLog(eventId) {
    return clone(load().log.filter((l) => l.event_id === eventId));
  },
  async addLog(entry) {
    write((db) => void db.log.push({ id: randomUUID(), payload: {}, ...entry, created_at: nowIso() }));
  },
  async getUserByEmail(email) {
    const e = email.trim().toLowerCase();
    const u = load().users.find((x) => x.email === e);
    return u ? clone(u) : null;
  },
  async getUserById(id) {
    const u = load().users.find((x) => x.id === id);
    return u ? clone(u) : null;
  },
  async insertUser(u) {
    const row: User = { ...u, email: u.email.trim().toLowerCase(), id: randomUUID(), created_at: nowIso() };
    write((db) => {
      if (db.users.some((x) => x.email === row.email)) throw new DuplicateError("email already in use");
      db.users.push(row);
    });
    return clone(row);
  },
  async updateUser(id, patch) {
    let out: User | null = null;
    if (!load().users.some((x) => x.id === id)) return null;
    write((db) => {
      const u = db.users.find((x) => x.id === id)!;
      Object.assign(u, patch);
      out = clone(u);
    });
    return out;
  },
  async reset() {
    const prev = load();
    const db = buildSeed();
    // Keep accounts people created during the demo; restore the demo users to their seed state.
    const demoEmails = new Set(db.users.map((u) => u.email));
    db.users.push(...(prev.users ?? []).filter((u) => !demoEmails.has(u.email)));
    db.version = prev.version + 1;
    persist(db);
  },
};
