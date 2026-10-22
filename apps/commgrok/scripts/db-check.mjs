#!/usr/bin/env node
// npm run db:check — verifies a Supabase project is set up the way CommGrok expects:
// connection, tables/views from supabase/migrations, seed data, RLS (what anon can and
// can't read) and Realtime broadcast on the live channel. Never prints the keys.
//
// Exit code: 0 when nothing FAILs (WARNs are fine), 1 otherwise or when Supabase isn't configured.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_CHANNEL = "community-events-live"; // keep in sync with lib/config.ts
const BUDGET_MS = 10_000; // overall budget for the database checks
const PER_CALL_MS = 4_000; // per HTTP call
const RT_SUBSCRIBE_MS = 5_000;
const RT_RECEIVE_MS = 5_000;
const HARD_LIMIT_MS = 20_000; // watchdog: never hang longer than this

const HINT = {
  conn: "wrong URL or service_role key (Project settings → API; the URL looks like https://<ref>.supabase.co)",
  anonKey: "wrong anon key (Project settings → API → anon public)",
  migrate: "run supabase/migrations/*.sql in order in the SQL editor (or npx supabase db push)",
  seed: "run supabase/seed.sql or npm run demo:reset",
  eventsOpen: "RLS policy on events is too open (anon should only see status = 'published')",
  eventsClosed: "anon can't read published events; re-run the init migration's \"Published events are public\" policy",
  emails: "emails are exposed; enable RLS on rsvps and remove the select policy",
  attendees: "anon can't read event_attendees_public; re-run the init migration (view + grant select to anon)",
  privateTable: "this table is readable by anon; enable RLS on it and drop any select policy for anon",
  realtime: "check Realtime is enabled for the project; broadcast needs no table setup",
};

// ---------- env ----------

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, ""); // inline comment on an unquoted value
    }
    out[m[1]] = val;
  }
  return out;
}

const fileEnv = parseEnvFile(join(ROOT, ".env.local"));
const env = (k) => (fileEnv[k] || process.env[k] || "").trim();

const URL_ = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", URL_],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.log(`db:check — missing: ${missing.join(", ")}`);
  console.log("The app is in LOCAL mode (.data/db.json); set these to use Supabase (see README → Database: Supabase).");
  process.exit(1);
}

const mask = (k) => (k.length > 6 ? `${k.slice(0, 6)}…` : "…");
let host = URL_;
try {
  host = new URL(URL_).host;
} catch {
  console.log(`db:check — NEXT_PUBLIC_SUPABASE_URL is not a valid URL.`);
  console.log(`Hint: ${HINT.conn}`);
  process.exit(1);
}
console.log(`db:check — ${host}  (anon ${mask(ANON)}, service ${mask(SERVICE)})\n`);

// ---------- results ----------

const rows = []; // { order, name, result, detail, hint }
function record(order, name, result, detail = "", hint = "") {
  rows.push({ order, name, result, detail: String(detail).replace(/\s+/g, " ").slice(0, 110), hint });
}

function printReport() {
  rows.sort((a, b) => a.order - b.order);
  const head = ["Check", "Result", "Detail"];
  const w0 = Math.max(head[0].length, ...rows.map((r) => r.name.length));
  const w1 = Math.max(head[1].length, ...rows.map((r) => r.result.length));
  const line = (a, b, c) => `${a.padEnd(w0)} | ${b.padEnd(w1)} | ${c}`;
  console.log(line(...head));
  console.log(`${"-".repeat(w0)}-+-${"-".repeat(w1)}-+-${"-".repeat(40)}`);
  for (const r of rows) console.log(line(r.name, r.result, r.detail));

  const hints = new Map(); // hint text → { fail, names }
  for (const r of rows) {
    if (r.result === "PASS" || !r.hint) continue;
    const h = hints.get(r.hint) ?? { fail: false, names: [] };
    h.fail ||= r.result === "FAIL";
    h.names.push(r.name);
    hints.set(r.hint, h);
  }
  if (hints.size) {
    console.log("\nHints:");
    for (const [text, h] of hints) console.log(`  ${h.fail ? "✗" : "!"} ${h.names.join(", ")}: ${text}`);
  }
  const fails = rows.filter((r) => r.result === "FAIL").length;
  const warns = rows.filter((r) => r.result === "WARN").length;
  const passes = rows.filter((r) => r.result === "PASS").length;
  console.log(`\n${passes} passed, ${warns} warning(s), ${fails} failed.`);
  return fails;
}

const watchdog = setTimeout(() => {
  record(999, "Overall", "FAIL", `checks did not finish within ${HARD_LIMIT_MS / 1000}s`, HINT.conn);
  printReport();
  process.exit(1);
}, HARD_LIMIT_MS);

// ---------- clients ----------

const started = Date.now();
const remaining = () => BUDGET_MS - (Date.now() - started);

const timedFetch = async (input, init = {}) => {
  const ms = Math.max(750, Math.min(PER_CALL_MS, remaining()));
  const t = AbortSignal.timeout(ms);
  const signal = init.signal ? AbortSignal.any([init.signal, t]) : t;
  try {
    return await fetch(input, { ...init, signal });
  } catch (e) {
    // "fetch failed" alone is useless; surface the cause (ENOTFOUND, ECONNREFUSED, cert errors, timeout)
    const cause = e?.cause?.code || e?.cause?.message;
    // (DOMException.message is read-only, so wrap rather than mutate)
    if (e?.name === "TimeoutError") throw new Error(`request timed out after ${ms}ms`);
    if (cause && !String(e?.message).includes(cause)) throw new Error(`${e.message} (${cause})`);
    throw e;
  }
};

const clientOpts = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: timedFetch },
  db: { retry: false }, // postgrest-js retries network errors with backoff (~7s); fail fast instead
};
const service = createClient(URL_, SERVICE, clientOpts);
const anon = createClient(URL_, ANON, clientOpts);

// ---------- error helpers ----------

const errText = (e) => (e ? [e.code, e.message || e.details || e.hint].filter(Boolean).join(" ") || "unknown error" : "");
const isNetworkErr = (e, status) =>
  !!e && (!status || /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|timeout|aborted|network|certificate/i.test(`${e.message} ${e.details} ${e.code}`));
const isAuthErr = (e, status) => !!e && (status === 401 || /invalid api key|jwt|unauthorized|no api key/i.test(`${e.message} ${e.hint}`));
const isMissingRel = (e, status) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || status === 404 || /does not exist|could not find the table|schema cache/i.test(`${e.message}`));
const isMissingCol = (e) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(`${e.message}`));
const isDenied = (e, status) => !!e && (e.code === "42501" || status === 401 || status === 403 || /permission denied/i.test(`${e.message}`));

async function q(builder) {
  try {
    const r = await builder;
    let error = r.error;
    // HEAD (count-only) requests get an empty body on errors, so postgrest-js may report none
    if (!error && r.status >= 400) error = { message: r.statusText || `HTTP ${r.status}`, code: r.status === 404 ? "PGRST205" : "" };
    return { data: r.data, error, count: r.count, status: r.status };
  } catch (e) {
    return { data: null, error: { message: e?.message || String(e), code: e?.code }, count: null, status: 0 };
  }
}
async function countOf(client, table, filter) {
  let b = client.from(table).select("*", { count: "exact", head: true });
  if (filter) b = filter(b);
  const r = await q(b);
  if (r.error || r.count !== null) return r;
  // postgrest-js turns a HEAD 404 (missing table, empty body) into "204, no error, count null":
  // re-ask with a GET so we get the real error code.
  let g = client.from(table).select("*", { count: "exact" }).limit(0);
  if (filter) g = filter(g);
  const r2 = await q(g);
  return r2.error ? r2 : { ...r2, count: r2.count ?? 0 };
}

// ---------- realtime (runs concurrently with the DB checks) ----------

async function realtimeCheck() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let channel;
  const cleanup = async () => {
    if (!channel) return;
    try {
      await Promise.race([anon.removeChannel(channel), new Promise((r) => setTimeout(r, 1000))]);
    } catch {}
  };
  try {
    let gotIt;
    const received = new Promise((res) => (gotIt = res));
    channel = anon
      .channel(LIVE_CHANNEL, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "change" }, (msg) => {
        if (msg?.payload?.test === true && msg.payload.at === nonce) gotIt(true);
      });

    const subStatus = await new Promise((res) => {
      const t = setTimeout(() => res("TIMED_OUT (5s)"), RT_SUBSCRIBE_MS);
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          res("SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(t);
          res(`${status}${err?.message ? `: ${err.message}` : ""}`);
        }
      });
    });
    if (subStatus !== "SUBSCRIBED") {
      return { result: "FAIL", detail: `anon subscribe → ${subStatus}`, hint: HINT.realtime };
    }

    let sendErr = "";
    try {
      const res = await fetch(`${URL_}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ messages: [{ topic: LIVE_CHANNEL, event: "change", payload: { test: true, at: nonce } }] }),
        signal: AbortSignal.timeout(PER_CALL_MS),
      });
      if (!res.ok) sendErr = `REST broadcast → HTTP ${res.status}`;
    } catch (e) {
      sendErr = `REST broadcast → ${e?.message || e}`;
    }
    if (sendErr) {
      return { result: "FAIL", detail: sendErr, hint: /HTTP 40[13]/.test(sendErr) ? HINT.conn : HINT.realtime };
    }

    const ok = await Promise.race([received, new Promise((r) => setTimeout(() => r(false), RT_RECEIVE_MS))]);
    return ok
      ? { result: "PASS", detail: `subscribed and received a test broadcast on ${LIVE_CHANNEL}` }
      : { result: "FAIL", detail: "subscribed, but the test broadcast didn't arrive within 5s", hint: HINT.realtime };
  } catch (e) {
    return { result: "FAIL", detail: `realtime error: ${e?.message || e}`, hint: HINT.realtime };
  } finally {
    await cleanup();
  }
}

// ---------- database checks ----------

const TABLES = ["teams", "users", "events", "event_required_teams", "approvals", "rsvps", "event_log"];
const VIEWS = ["event_attendees_public", "event_rsvp_counts"];

async function dbChecks(startRealtime) {
  // 1. Connection
  const conn = await q(service.from("teams").select("id").limit(1));
  if (conn.error && (isNetworkErr(conn.error, conn.status) || isAuthErr(conn.error, conn.status))) {
    record(1, "Connection", "FAIL", `service client → ${conn.status ? `HTTP ${conn.status} ` : ""}${errText(conn.error)}`, HINT.conn);
    return false;
  }
  if (conn.error && !isMissingRel(conn.error, conn.status)) {
    record(1, "Connection", "FAIL", `service client → HTTP ${conn.status} ${errText(conn.error)}`, HINT.conn);
    return false;
  }
  record(1, "Connection", "PASS", `service client reached ${host}${conn.error ? " (teams missing, see below)" : ""}`);
  startRealtime(); // runs alongside the remaining DB checks

  // 2. Tables, views, newer columns — in parallel
  const counts = {};
  const relChecks = [...TABLES, ...VIEWS].map(async (name, i) => {
    const isView = VIEWS.includes(name);
    const label = `${isView ? "View" : "Table"} ${name}`;
    const r = await countOf(service, name);
    if (!r.error) {
      counts[name] = r.count ?? 0;
      record(10 + i, label, "PASS", `${r.count ?? "?"} row(s)`);
    } else if (isMissingRel(r.error, r.status)) {
      record(10 + i, label, "FAIL", `missing (${errText(r.error) || `HTTP ${r.status}`})`, HINT.migrate);
    } else {
      record(10 + i, label, "FAIL", `HTTP ${r.status} ${errText(r.error)}`, isNetworkErr(r.error, r.status) ? HINT.conn : HINT.migrate);
    }
  });
  const revCheck = (async () => {
    const r = await q(service.from("events").select("revision").limit(1));
    if (!r.error) record(30, "Column events.revision", "PASS", "present");
    else if (isMissingRel(r.error, r.status) && !isMissingCol(r.error)) record(30, "Column events.revision", "FAIL", "events table missing", HINT.migrate);
    else record(30, "Column events.revision", "FAIL", isMissingCol(r.error) ? "missing (newer migration not applied)" : errText(r.error), HINT.migrate);
  })();
  await Promise.all([...relChecks, revCheck]);

  // 3. Seed
  if (counts.events === undefined) {
    record(40, "Seed data", "WARN", "skipped (events table not readable)", HINT.migrate);
  } else if (counts.events > 0) {
    record(40, "Seed data", "PASS", `${counts.events} event(s), ${counts.teams ?? "?"} team(s)`);
  } else {
    record(40, "Seed data", "WARN", "events table is empty", HINT.seed);
  }

  if (counts.events === undefined) return true; // nothing more we can test meaningfully

  // 4–7. RLS — in parallel
  const rls4 = (async () => {
    const [svc, an] = await Promise.all([
      countOf(service, "events", (b) => b.eq("status", "published")),
      q(anon.from("events").select("id").eq("status", "published").limit(5)),
    ]);
    const name = "RLS: anon reads published";
    if (an.error) {
      record(50, name, "FAIL", `anon → ${errText(an.error)}`, isAuthErr(an.error, an.status) ? HINT.anonKey : HINT.eventsClosed);
    } else if ((an.data?.length ?? 0) > 0) {
      record(50, name, "PASS", `anon sees published events (${svc.count ?? "?"} total)`);
    } else if (!svc.error && svc.count === 0) {
      record(50, name, "WARN", "no published events to test with (inconclusive)", HINT.seed);
    } else {
      record(50, name, "FAIL", `service sees ${svc.count ?? "?"} published, anon sees 0`, HINT.eventsClosed);
    }
  })();

  const rls5 = (async () => {
    const name = "RLS: anon can't read unpublished";
    const svc = await q(service.from("events").select("id,status").neq("status", "published").limit(50));
    if (svc.error) return record(51, name, "WARN", `service → ${errText(svc.error)}`);
    const ids = (svc.data ?? []).map((e) => e.id);
    if (!ids.length) return record(51, name, "WARN", "no proposed/renegotiating/rejected events to test with (inconclusive)");
    const an = await q(anon.from("events").select("id").in("id", ids));
    if (an.error) {
      return isDenied(an.error, an.status)
        ? record(51, name, "PASS", `anon denied (${errText(an.error)})`)
        : record(51, name, "WARN", `anon → ${errText(an.error)}`);
    }
    const n = an.data?.length ?? 0;
    if (n === 0) record(51, name, "PASS", `anon sees 0 of ${ids.length} unpublished event(s)`);
    else record(51, name, "FAIL", `anon can read ${n} of ${ids.length} unpublished event(s)`, HINT.eventsOpen);
  })();

  const rls6 = (async () => {
    const name = "RLS: anon can't read RSVP emails";
    const an = await q(anon.from("rsvps").select("email").limit(1));
    const svcN = counts.rsvps;
    if (an.error) {
      if (isMissingRel(an.error, an.status) && svcN === undefined) record(52, name, "WARN", "rsvps table missing", HINT.migrate);
      else record(52, name, "PASS", `anon denied (${errText(an.error)})`);
    } else if ((an.data?.length ?? 0) > 0) {
      record(52, name, "FAIL", "anon can select rsvps.email", HINT.emails);
    } else if (!svcN) {
      record(52, name, "WARN", "anon sees 0 rows, but there are no RSVPs yet (inconclusive)");
    } else {
      record(52, name, "PASS", `anon sees 0 of ${svcN} RSVP(s)`);
    }

    const name2 = "RLS: anon reads attendee names";
    const v = await q(anon.from("event_attendees_public").select("event_id,first_name").limit(5));
    if (v.error) record(53, name2, "WARN", `anon → ${errText(v.error)}`, HINT.attendees);
    else record(53, name2, "PASS", `event_attendees_public readable (${v.data?.length ?? 0} sample row(s))`);
  })();

  const rls7 = ["users", "approvals", "event_log"].map(async (t, i) => {
    const name = `RLS: anon can't read ${t}`;
    const an = await q(anon.from(t).select("*").limit(1));
    if (an.error) {
      if (isMissingRel(an.error, an.status) && counts[t] === undefined) record(54 + i, name, "WARN", `${t} table missing`, HINT.migrate);
      else record(54 + i, name, "PASS", `anon denied (${errText(an.error)})`);
    } else if ((an.data?.length ?? 0) > 0) {
      record(54 + i, name, "FAIL", `anon can read rows of ${t}`, HINT.privateTable);
    } else {
      record(54 + i, name, "PASS", `anon sees 0 rows${counts[t] ? ` (of ${counts[t]})` : counts[t] === 0 ? " (table empty)" : ""}`);
    }
  });

  await Promise.all([rls4, rls5, rls6, ...rls7]);
  return true;
}

// ---------- run ----------

let rtPromise = null;
let connected = false;
try {
  connected = await dbChecks(() => (rtPromise = realtimeCheck()));
} catch (e) {
  record(2, "Database checks", "FAIL", `unexpected error: ${e?.message || e}`, HINT.conn);
}

if (rtPromise) {
  const rt = await rtPromise;
  record(60, "Realtime broadcast", rt.result, rt.detail, rt.hint);
} else {
  record(60, "Realtime broadcast", "WARN", "skipped (no database connection)");
}

clearTimeout(watchdog);
const fails = printReport();
try {
  await Promise.race([anon.removeAllChannels(), new Promise((r) => setTimeout(r, 1000))]);
  anon.realtime.disconnect();
} catch {}
await new Promise((r) => setTimeout(r, 100)); // let sockets close before exiting
process.exit(fails ? 1 : 0);
