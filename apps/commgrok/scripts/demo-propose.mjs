// Simulates the bot: proposes "AI Builders Social × Expedite" for 8 days from now.
// Usage: npm run demo:propose   (reads PROPOSALS_API_KEY / SITE from env or .env.local)
import fs from "node:fs";

const env = {};
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {}
const key = process.env.PROPOSALS_API_KEY || env.PROPOSALS_API_KEY || "dev-secret";
const site = process.env.SITE || env.SITE || "http://localhost:3000";

const d = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
// Wall-clock London time -> ISO with the right offset (handles BST/GMT).
function london(day, hhmm) {
  const guess = new Date(`${day}T${hhmm}:00Z`);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess).map((x) => [x.type, x.value]),
  );
  const offMin = (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - offMin * 60000).toISOString();
}
const body = {
  title: "AI Builders Social × Expedite",
  event_type: "social",
  communities: ["Builders Collective", "Expedite"],
  description_md:
    "An evening social for London's AI builders, co-hosted with the Expedite crew.\n\n- Lightning demos from the community (3 minutes each)\n- Drinks and food from 19:00\n- No talks over 5 minutes, promise",
  start_at: london(d, "18:30"),
  end_at: london(d, "21:30"),
  venue_name: "Canal Works",
  venue_address: "12 Wharf Road, London N1 7GR",
  cover_url: "/covers/ai-social.svg",
  capacity: 80,
  hosts: [{ name: "Tom Adeyemi" }, { name: "Maya Brooks" }],
};

const res = await fetch(`${site}/api/proposals`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": key },
  body: JSON.stringify(body),
});
const text = await res.text();
let data;
try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
console.log(res.status, res.ok ? `Proposed: ${data.review_url}` : data);
if (!res.ok) process.exitCode = 1;
