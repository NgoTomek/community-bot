// Simulates the bot answering an organiser who sent a proposal back ("renegotiate").
// Usage: npm run demo:revise -- <id|slug|latest>   (default: latest = the newest organiser note)
// Reads PROPOSALS_API_KEY / SITE from env or .env.local, like demo-propose.mjs.
import fs from "node:fs";

const env = {};
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}
const key = process.env.PROPOSALS_API_KEY || env.PROPOSALS_API_KEY || "dev-secret";
const site = process.env.SITE || "http://localhost:3000";
const target = process.argv[2] || "latest";
const TZ = "Europe/London";
const headers = { "Content-Type": "application/json", "X-API-Key": key };

async function call(method, path, body) {
  const res = await fetch(`${site}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  return { res, data };
}

// ---- London wall-clock helpers (keep 18:30 as 18:30 across BST/GMT) ----
function parts(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, weekday: p.weekday };
}
function london(day, hhmm) {
  const guess = new Date(`${day}T${hhmm}:00Z`);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess).map((x) => [x.type, x.value]),
  );
  const offMin = (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - offMin * 60000).toISOString();
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const fmt = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Move both start and end to a new day, keeping the London wall-clock times. */
function moveToDay(ev, newDay) {
  const s = parts(ev.start_at);
  const e = parts(ev.end_at);
  const spanDays = Math.round((Date.parse(`${e.day}T00:00:00Z`) - Date.parse(`${s.day}T00:00:00Z`)) / 86400000);
  return { start_at: london(newDay, s.hhmm), end_at: london(addDays(newDay, spanDays), e.hhmm) };
}
function shiftHours(ev, h) {
  return {
    start_at: new Date(Date.parse(ev.start_at) + h * 3600000).toISOString(),
    end_at: new Date(Date.parse(ev.end_at) + h * 3600000).toISOString(),
  };
}

function planRevision(ev, note) {
  const n = note.toLowerCase();
  const s = parts(ev.start_at);
  const curDow = DAYS.findIndex((d) => d.startsWith(s.weekday.toLowerCase().slice(0, 3)));
  // The weekday the organiser asks for: the first one mentioned that isn't the current day
  // ("Can we move this to a Thursday? Our Tuesday slot is taken." -> Thursday).
  const mentioned = DAYS.map((d, i) => ({ i, at: n.indexOf(d) }))
    .filter((x) => x.at >= 0 && x.i !== curDow)
    .sort((a, b) => a.at - b.at);
  const named = mentioned.length ? mentioned[0].i : -1;
  if (named >= 0 || /\b(date|day|days|week|weekend|another night|different night)\b/.test(n) || DAYS.some((d) => n.includes(d))) {
    let newDay;
    if (named >= 0 && named !== curDow) {
      // Same week if that day is still ahead of the current date, else the following week.
      newDay = addDays(s.day, (named - curDow + 7) % 7);
    } else if (/weekend/.test(n)) {
      newDay = addDays(s.day, (6 - curDow + 7) % 7 || 7);
    } else {
      newDay = addDays(s.day, 7);
    }
    return { patch: moveToDay(ev, newDay), what: `moved to ${DAYS[new Date(`${newDay}T12:00:00Z`).getUTCDay()]}` };
  }
  if (/\b(time|earlier|later|start|finish|end|late|early)\b/.test(n)) {
    const h = /\b(earlier|early|too late)\b/.test(n) ? -1 : 1;
    return { patch: shiftHours(ev, h), what: h < 0 ? "starts an hour earlier" : "starts an hour later" };
  }
  if (/\b(venue|place|room|space|location|hall)\b/.test(n)) {
    return {
      patch: { venue_name: "Lantern Hall", venue_address: "41 Pentonville Road, London N1 9HF" },
      what: "moved to Lantern Hall",
    };
  }
  if (/\b(budget|cost|costs|price|cheaper|expensive|money|pay)\b/.test(n)) {
    const capacity = ev.capacity ? Math.max(10, Math.round(ev.capacity * 0.6)) : 30;
    const line = "\n\nKept lean: smaller room, snacks instead of a full dinner, and a free ticket for everyone.";
    return {
      patch: { capacity, price_label: "Free", description_md: ev.description_md.includes("Kept lean") ? ev.description_md : ev.description_md + line },
      what: `capacity down to ${capacity}, cheaper plan`,
    };
  }
  return { patch: shiftHours(ev, 1), what: "starts an hour later" };
}

// ---- 1. Find the event the organisers sent back ----
const poll = await call("GET", "/api/proposals?status=renegotiating");
if (!poll.res.ok) {
  console.error(poll.res.status, poll.data);
  process.exit(1);
}
const items = poll.data.items || [];
let ev;
if (target === "latest") {
  ev = items[0]; // newest organiser note first
} else {
  ev = items.find((x) => x.id === target || x.slug === target);
  if (!ev) {
    const one = await call("GET", `/api/events/${encodeURIComponent(target)}`);
    if (one.res.ok) ev = one.data;
  }
}
if (!ev) {
  console.log(target === "latest" ? "Nothing is waiting for a revision (no renegotiating proposals)." : `No event found for "${target}".`);
  process.exit(target === "latest" ? 0 : 1);
}

const note = ev.latest_note?.decision === "renegotiate" ? ev.latest_note.note : ev.latest_note?.note || "";
console.log(`Event:  ${ev.title}  (${ev.status}, revision ${ev.revision})`);
console.log(`Note:   ${note ? `"${note}" (${ev.latest_note.by}${ev.latest_note.team ? `, ${ev.latest_note.team}` : ""})` : "(none)"}`);

// ---- 2. Apply a plausible change and send the revision ----
const { patch, what } = planRevision(ev, note);
const message = `Revised after organiser note: ${note || "(no note)"}`;
const put = await call("PUT", `/api/proposals/${ev.id}`, { ...patch, message });
if (!put.res.ok) {
  console.error(put.res.status, put.data);
  process.exit(1);
}
const out = put.data;
console.log(`Bot:    ${what}`);
for (const [label, c] of Object.entries(out.changes || {})) {
  const show = (v) => (v == null ? "(none)" : String(v));
  console.log(`        ${label}: ${show(c.from)} -> ${show(c.to)}`);
}
console.log(`Now:    ${out.status}, revision ${out.revision}, ${fmt(out.start_at)}`);
console.log(`Review: ${out.review_url}`);
