#!/usr/bin/env node
/**
 * End-to-end smoke test against a running server (local demo mode or Supabase).
 *
 *   node scripts/smoke.mjs --base http://localhost:3000 --key <PROPOSALS_API_KEY>
 *   (or env SMOKE_BASE / PROPOSALS_API_KEY)
 *
 * Creates throwaway proposals and walks them through accept / send back / revise / publish /
 * RSVP and the reject path. Run `npm run demo:reset` afterwards to restore the demo data.
 * Exits 1 on any failed step. Uses only built-in fetch with manual cookie handling.
 */
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const BASE = (arg("base") || process.env.SMOKE_BASE || "http://localhost:3000").replace(/\/+$/, "");
const KEY = arg("key") || process.env.PROPOSALS_API_KEY || "";
const PASSWORD = "demo1234";
const DEADLINE = Date.now() + 30_000;

let passed = 0;
let failed = 0;
const pass = (name, extra = "") => {
  passed++;
  console.log(`PASS  ${name}${extra ? `  (${extra})` : ""}`);
};
const failStep = (name, why) => {
  failed++;
  console.log(`FAIL  ${name}\n      ${why}`);
};

async function req(method, path, { body, key, cookie, redirect = "manual" } = {}) {
  const left = DEADLINE - Date.now();
  if (left <= 0) throw new Error("smoke test exceeded 30s");
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (key) headers["x-api-key"] = key;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
    signal: AbortSignal.timeout(Math.min(left, 15_000)),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json, headers: res.headers };
}

/** Run one step; `fn` returns an optional detail string or throws with the reason. */
async function step(name, fn) {
  try {
    const extra = await fn();
    pass(name, typeof extra === "string" ? extra : "");
    return true;
  } catch (e) {
    failStep(name, e?.message || String(e));
    return false;
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const brief = (r) => `HTTP ${r.status}: ${r.text.slice(0, 200).replace(/\s+/g, " ")}`;

const iso = (days, hour = 18) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace("Z", "+00:00");
};
const plusDays = (isoStr, days) => new Date(new Date(isoStr).getTime() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z").replace("Z", "+00:00");
const rand = Math.random().toString(36).slice(2, 8);

async function login(email) {
  const r = await req("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  expect(r.status === 200, `login ${email}: ${brief(r)}`);
  const setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
  const c = setCookies.join("\n").match(/cb_session=([^;\s]+)/);
  expect(c, `login ${email}: no cb_session cookie in set-cookie`);
  return `cb_session=${c[1]}`;
}

async function createProposal(title, key = KEY) {
  const start = iso(9);
  return req("POST", "/api/proposals", {
    key,
    body: { title, event_type: "social", start_at: start, end_at: plusDays(start, 0.0834), venue_name: "Smoke Test Hall" },
  });
}

async function main() {
  console.log(`Smoke test against ${BASE}${KEY ? "" : "  (no API key: pass --key or set PROPOSALS_API_KEY)"}\n`);
  const t0 = Date.now();

  await step("GET / -> 200", async () => {
    const r = await req("GET", "/", { redirect: "follow" });
    expect(r.status === 200, brief(r));
  });
  await step("GET /calendar.ics -> VCALENDAR", async () => {
    const r = await req("GET", "/calendar.ics");
    expect(r.status === 200 && r.text.includes("BEGIN:VCALENDAR"), brief(r));
  });

  await step("POST /api/proposals with a bad key -> 401", async () => {
    const r = await createProposal(`Smoke bad key ${rand}`, "definitely-wrong-key");
    expect(r.status === 401, brief(r));
  });

  let ev = null;
  await step("POST /api/proposals with the key -> 201", async () => {
    const r = await createProposal(`Smoke social ${rand}`);
    expect(r.status === 201 && r.json?.id && r.json?.slug, brief(r));
    ev = r.json;
    return `id ${ev.id}, slug ${ev.slug}`;
  });

  let tom = null;
  let maya = null;
  await step("login tom@commgrok.demo + maya@commgrok.demo", async () => {
    tom = await login("tom@commgrok.demo");
    maya = await login("maya@commgrok.demo");
  });

  if (ev && tom && maya) {
    const decide = (cookie, body, id = ev.id) => req("POST", `/api/events/${id}/decision`, { cookie, body });

    await step("Tom accepts -> 200", async () => {
      const r = await decide(tom, { decision: "approved" });
      expect(r.status === 200, brief(r));
      return `status ${r.json?.status}`;
    });
    await step("Maya sends back without a note -> 400", async () => {
      const r = await decide(maya, { decision: "renegotiate" });
      expect(r.status === 400, brief(r));
    });
    await step("Maya sends back with a note -> renegotiating", async () => {
      const r = await decide(maya, { decision: "renegotiate", note: "Different date please" });
      expect(r.status === 200 && r.json?.status === "renegotiating", brief(r));
    });
    await step("GET /api/proposals?status=renegotiating -> has the event + latest_note", async () => {
      const r = await req("GET", "/api/proposals?status=renegotiating", { key: KEY });
      expect(r.status === 200, brief(r));
      const list = Array.isArray(r.json) ? r.json : r.json?.proposals || r.json?.events || r.json?.items || r.json?.data || [];
      const item = list.find((x) => x.id === ev.id);
      expect(item, `event ${ev.id} not in the list (${list.length} items)`);
      expect(item.latest_note, "item has no latest_note");
      const noteText = typeof item.latest_note === "string" ? item.latest_note : item.latest_note.note;
      return `latest_note: ${JSON.stringify(noteText)}`;
    });
    await step("PUT /api/proposals/{id} (revised, +7 days) -> 200", async () => {
      const start = plusDays(ev.start_at, 7);
      const end = plusDays(ev.end_at || ev.start_at, 7);
      const r = await req("PUT", `/api/proposals/${ev.id}`, { key: KEY, body: { start_at: start, end_at: end, message: "Moved a week later as asked" } });
      expect(r.status === 200, brief(r));
    });
    await step("GET /api/events/{id} -> proposed, Tom's approval stale", async () => {
      const r = await req("GET", `/api/events/${ev.id}`, { key: KEY });
      expect(r.status === 200, brief(r));
      expect(r.json?.status === "proposed", `status is ${r.json?.status}, expected proposed`);
      const teams = r.json?.approvals?.teams || [];
      const tomRow = teams.find((t) => /tom/i.test(t.approver_name || "")) || teams.find((t) => t.state === "stale");
      expect(tomRow?.state === "stale", `team states: ${JSON.stringify(teams.map((t) => [t.team_name, t.state, t.approver_name]))}`);
      return `revision ${r.json?.revision}`;
    });
    let publishedCount = 0;
    await step("Tom + Maya accept -> published (justPublished exactly once)", async () => {
      const a = await decide(tom, { decision: "approved" });
      expect(a.status === 200, `Tom: ${brief(a)}`);
      const b = await decide(maya, { decision: "approved" });
      expect(b.status === 200, `Maya: ${brief(b)}`);
      publishedCount = [a, b].filter((x) => x.json?.justPublished === true).length;
      expect(b.json?.status === "published", `status is ${b.json?.status}`);
      expect(publishedCount === 1, `justPublished was true ${publishedCount} times`);
    });
    await step("GET /e/{slug} without a cookie -> 200", async () => {
      const r = await req("GET", `/e/${ev.slug}`, { redirect: "follow" });
      expect(r.status === 200, `HTTP ${r.status}`);
    });
    await step("POST /api/events/{id}/rsvp -> 201", async () => {
      const r = await req("POST", `/api/events/${ev.id}/rsvp`, { body: { name: "Smoke Tester", email: `smoke-${rand}@example.com` } });
      expect(r.status === 201, brief(r));
      return `rsvp ${r.json?.status}`;
    });

    // Reject path
    let rej = null;
    await step("reject path: new proposal -> 201", async () => {
      const r = await createProposal(`Smoke reject ${rand}`);
      expect(r.status === 201 && r.json?.id, brief(r));
      rej = r.json;
    });
    if (rej) {
      await step("reject path: Tom rejects -> rejected", async () => {
        const r = await decide(tom, { decision: "rejected", note: "Not a fit" }, rej.id);
        expect(r.status === 200 && r.json?.status === "rejected", brief(r));
      });
      await step("reject path: GET /e/{slug} -> 404", async () => {
        const r = await req("GET", `/e/${rej.slug}`, { redirect: "follow" });
        expect(r.status === 404, `HTTP ${r.status}`);
      });
      await step("reject path: PUT /api/proposals/{id} -> 409", async () => {
        const r = await req("PUT", `/api/proposals/${rej.id}`, { key: KEY, body: { title: "Trying again after reject" } });
        expect(r.status === 409, brief(r));
      });
    }
  } else {
    failStep("decision flow", "skipped: needs a created proposal and both logins");
  }

  console.log(`\n${failed ? "FAILED" : "OK"}: ${passed} passed, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (ev || passed) console.log("Tip: run `npm run demo:reset` to restore the demo data.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.log(`FAIL  smoke test crashed: ${e?.message || e}`);
  process.exit(1);
});
