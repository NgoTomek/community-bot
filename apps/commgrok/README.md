# CommGrok

> **Where this lives:** `apps/commgrok` in the `community-bot` monorepo (npm workspace `@community-bots/commgrok`). Run the commands below from this folder, or from the repo root with `-w @community-bots/commgrok` once the root `package.json` with workspaces is on `main` (then install from the root, which uses the root lockfile).

A lightweight Luma for London communities, run by the communities themselves. Bots propose events, organisers from each team accept, reject or send them back with one tap, and accepted events go live on a public calendar with RSVPs.

## Roles

| Role | Needs an account? | What they do |
| --- | --- | --- |
| **Public / guests** | No, never | Browse the calendar, open event pages, RSVP with name + email, add to calendar |
| **Organisers** | Yes (invite code) | Review bot proposals in `/approvals` for their team: Accept, Send back to bots, or Reject. Manage guest lists |
| **Bots** | API key | Propose events, poll for organiser feedback, send revised versions |

## The three decisions

| Decision | Button | What happens |
| --- | --- | --- |
| **Accept** | "Accept" | When every required team has accepted the *current revision*, the event publishes to the public calendar, exactly once. |
| **Send back to bots** | "Send back to bots" | A note is **required**. Status becomes `renegotiating`, the bot is notified with the note, and it sends a revised version. A revision bumps `revision`, which resets every approval, and status returns to `proposed`. |
| **Reject** | "Reject" | Final. Status becomes `rejected` (optional reason). The event never appears publicly and the bot is notified. |

Reject and send-back win over pending accepts. Only open events (`proposed` or `renegotiating`) can be decided.

Statuses: `proposed` → (`renegotiating` ⇄ `proposed`) → `published` | `rejected`. Published events can later be `cancelled` (shown as "Cancelled" on the public page). Proposed, renegotiating and rejected events are never public (404).

Approval mode (`NEXT_PUBLIC_APPROVAL_MODE`): `all_teams` (default, every required team must accept) or `any_organiser` (one accept publishes).

## Features

- **Bot proposals and revisions** over a small API with an API key.
- **Public calendar** with Upcoming/Past tabs and type filters; event pages with guest RSVP and an automatic waitlist when full.
- **Calendar files:** `.ics` per event, plus a subscribable `/calendar.ics` feed.
- **Live updates:** decisions and RSVPs appear on other devices straight away (Supabase Realtime, or server-sent events in local mode).
- **Webhooks** for published, rejected and sent-back events.
- **Activity log** on every proposal, including "Sent back: …" and "Revised by bot" with a small diff of what changed.
- **Installable PWA**, works offline for pages you've opened.
- **Two backends:** local demo mode (a JSON file, zero setup) or Supabase.

## Quickstart (local demo mode)

```bash
npm install
cp .env.example .env.local   # set PROPOSALS_API_KEY and AUTH_SECRET to any secrets
npm run dev
```

Open http://localhost:3000. The public calendar needs no login. Organisers go to **Organiser login** in the header.

Leave the `SUPABASE_*` variables empty to run in local demo mode. Data lives in `.data/db.json` and is seeded on first run. `npm run demo:reset` (or `POST /api/demo/reset`) restores the seed events and demo accounts.

### Demo organiser accounts

| Who | Email | Password | Team |
| --- | --- | --- | --- |
| Tom Adeyemi | `tom@commgrok.demo` | `demo1234` | Builders Collective (host community) |
| Maya Brooks | `maya@commgrok.demo` | `demo1234` | Canal Works (venue) |

The login page has one-tap "Demo: sign in as…" buttons for both. New organiser accounts need the invite code (`ORGANISER_INVITE_CODE`, default **`commgrok`**).

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROPOSALS_API_KEY` | — (required for the bot API) | Shared secret the bots send as `X-API-Key` |
| `AUTH_SECRET` | dev-only default in code | HMAC key for the organiser session cookie. **Set a long random string in production** |
| `ORGANISER_INVITE_CODE` | `commgrok` | Needed to create an organiser account at `/signup` |
| `NEXT_PUBLIC_APPROVAL_MODE` | `all_teams` | `all_teams` or `any_organiser` |
| `EVENTS_WEBHOOK_URL` | empty | Where we POST event.published / event.rejected / event.renegotiate |
| `PUBLISH_WEBHOOK_URL` | empty | Legacy alias, used only when `EVENTS_WEBHOOK_URL` is empty |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Fallback base URL (the request's host wins, so tunnels and LAN IPs just work) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | empty | Supabase mode (leave empty for local mode) |

## Database: Supabase (optional, recommended for production)

**Why.** Local mode keeps everything in `.data/db.json`: perfect for demos, zero setup, but it lives on one machine and won't survive serverless hosting. Supabase gives you hosted Postgres, Realtime and backups, and it's **required for serverless hosting such as Vercel**. The app switches automatically: when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, it uses Supabase (see `isSupabaseMode` in `lib/config.ts`); otherwise it uses the local file.

### Setup

1. **Create a project** at [supabase.com](https://supabase.com). Pick the region **West EU (London)**.
2. **Create the schema.** In **SQL Editor**, run every file in `supabase/migrations/` **in filename order**, then `supabase/seed.sql` (demo teams, organisers, events and RSVPs; dates are relative to today, and it's safe to re-run).
   CLI alternative: `npx supabase link --project-ref <ref>` then `npx supabase db push` (applies the migrations), then run `supabase/seed.sql` in the SQL editor or `npm run demo:reset` once the app is running.
3. **Add the keys** to `.env.local` (Project settings → API):

   | Variable | Value | Who sees it |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Public (browser, for Realtime) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | Public, but limited by RLS |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | **Server-only.** Bypasses RLS. Never prefix it with `NEXT_PUBLIC_`, never commit it |

4. **Verify:** `npm run db:check`. It checks every table and prints row counts, proves the anon key can read published events but **not** proposals or RSVP emails, and sends a test Realtime broadcast. Every failure prints a hint.
5. **Run it:** `npm run build && npm start` (`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing them). Confirm the calendar shows the seed events, then open an approval on two phones: a decision on one updates the other live.

### What lives where

| Thing | Where | Public (anon key) | Server routes (service role) |
| --- | --- | --- | --- |
| `teams` | table | read | read |
| `events` | table | read **published** only | everything |
| `event_required_teams`, `approvals`, `event_log` | tables | nothing | everything |
| `users` (organisers, scrypt hashes) | table | nothing | login, sign-up |
| `rsvps` | table | insert (published events only); **can't read emails** | guest lists, CSV export |
| `event_attendees_public`, `event_rsvp_counts` | views | first names and counts for published events | not needed |
| Live updates | Realtime **broadcast**, channel `community-events-live`, event `change` | subscribe | send (REST, service role) |

The app itself reads and writes through server routes with the service role and enforces the rules in `lib/workflow.ts` (team checks, the publish rule). RLS is defence in depth for anyone holding the public anon key.

### Switching back to local mode

Comment out or remove the three `SUPABASE` variables in `.env.local` and restart. The app goes back to `.data/db.json`; nothing else changes.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `relation "…" does not exist`, or `db:check` shows missing tables | Run **all** files in `supabase/migrations/` in order, then `supabase/seed.sql` |
| `new row violates row-level security policy` / empty results on the server | The server must use the **service_role** key. Check `SUPABASE_SERVICE_ROLE_KEY` isn't the anon key |
| `Invalid API key` / 401 | The key belongs to another project, or the URL and keys were swapped. Copy them again from Project settings → API |
| Phones don't update live | Check `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` were set **at build time** (rebuild), and that `db:check` passes the Realtime row. Pages also refresh when you switch back to the tab |
| The app still uses `.data/db.json` | Supabase mode needs both the URL and the service role key. Restart after editing `.env.local` |
| `npm run demo:reset` | Works in both modes. In Supabase mode it wipes and re-seeds the tables |

## Live demo script

1. `npm run dev`, then share the Cloudflare tunnel URL (`npx cloudflared tunnel --url http://localhost:3000`) or `http://<laptop-LAN-IP>:3000`. Links, QR codes and `.ics` files use whichever host the request came in on.
2. `npm run demo:reset`.
3. Phone A: **Organiser login → Demo: Tom**. Phone B: **Demo: Maya**.
4. `npm run demo:propose`. The bot's "AI Builders Social × Expedite" appears live under **Decide** on both phones.
5. Phone A taps **Send back to bots**, picks "Different date" (or types a note) and sends. It moves to the **Bots** tab.
6. `npm run demo:revise` (or `npm run demo:revise -- <id|slug|latest>`). The bot reads the note, moves the date, and sends a revision. The activity log shows "Revised by bot" with the diff, and every approval resets.
7. Both phones tap **Accept**. Confetti, it publishes once, and it's on the public calendar for logged-out visitors.
8. **Manage → QR code**: the audience scans and RSVPs as guests. Full events waitlist.
9. Reject path: open another proposal, tap **Reject**, add a reason. It's gone for good and the bot is notified.

## Bot API

All bot endpoints use the header `X-API-Key: $PROPOSALS_API_KEY`.

### Create a proposal

```bash
curl -X POST http://localhost:3000/api/proposals \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PROPOSALS_API_KEY" \
  -d '{
    "title": "AI Builders Social × Expedite",
    "event_type": "social",
    "communities": ["Builders Collective", "Expedite"],
    "description_md": "An evening social for London AI builders.\n\n- Lightning demos\n- Drinks from 19:00",
    "start_at": "2026-11-05T18:30:00+00:00",
    "end_at": "2026-11-05T21:30:00+00:00",
    "venue_name": "Canal Works",
    "venue_address": "12 Wharf Road, London N1 7GR",
    "capacity": 80,
    "hosts": [{ "name": "Tom Adeyemi" }, { "name": "Maya Brooks" }]
  }'
```

Returns `201` with the event JSON (`id`, `slug`, `status`, `url`, `review_url`, …). Optional fields: `slug`, `timezone` (default `Europe/London`), `online_url`, `cover_url`, `price_label` (default `Free`), `visibility`, `required_team_ids` (default: every team). `event_type` is `meetup | talk | workshop | social | hackathon | other`. Dates are ISO 8601 with an offset. Errors: `401` bad key, `400` validation.

### Poll for organiser feedback

```bash
curl "http://localhost:3000/api/proposals?status=renegotiating" -H "X-API-Key: $PROPOSALS_API_KEY"
```

Returns `{ "items": [ { ...event, "latest_note": { "decision": "renegotiate", "note": "Can we do a Thursday?", "by": "Maya Brooks", "team": "Canal Works", "at": "…", "revision": 1 } } ] }`. Leave out `status` to get every open proposal.

### Send a revised version

```bash
curl -X PUT http://localhost:3000/api/proposals/<id-or-slug> \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PROPOSALS_API_KEY" \
  -d '{ "start_at": "2026-11-12T18:30:00+00:00", "end_at": "2026-11-12T21:30:00+00:00",
        "message": "Revised after organiser note: moved to Thursday" }'
```

Send only the fields that change. This bumps `revision`, resets every approval and sets the status back to `proposed`. Returns `409` if the event is rejected, published or cancelled.

### Read one event

```bash
curl http://localhost:3000/api/events/<id-or-slug> -H "X-API-Key: $PROPOSALS_API_KEY"
```

Returns the event with `status`, `approvals: { approved, required, teams: [{ team_name, state, approver_name, note, at }] }`, `latest_note` and `rsvps: { going, waitlist, spots_left }`. A team's `state` is `waiting | approved | rejected | renegotiate | stale` (`stale` = accepted an earlier revision). Published events are public; others need the key.

### Webhooks

If `EVENTS_WEBHOOK_URL` (or the legacy `PUBLISH_WEBHOOK_URL`) is set, we POST:

```json
{
  "type": "event.published | event.rejected | event.renegotiate",
  "event": { "id": "…", "slug": "…", "title": "…", "status": "…", "start_at": "…", "url": "https://…/e/<slug>" },
  "note": "Can we do a Thursday? Our Tuesday slot is taken.",
  "decided_by": "Maya Brooks",
  "team": "Canal Works"
}
```

`event.published` fires exactly once per event. Every delivery attempt is recorded in the event's activity log.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Public calendar (published events only) |
| `/e/[slug]` | Event page with guest RSVP (published or cancelled events only) |
| `/e/[slug]/ics` | Single event as `.ics` |
| `/calendar.ics` | Subscribable iCal feed |
| `/login`, `/signup` | Organiser login / sign-up (invite code) |
| `/join` | Switch your organiser team |
| `/approvals` | Inbox tabs: Decide / Bots / Live / Rejected |
| `/approvals/[id]` | Review a proposal: Accept, Send back to bots, Reject, or edit |
| `/approvals/new` | Propose an event by hand |
| `/manage/[slug]` | Guest list, CSV export, QR code, cancel |

## Security notes

- **Organiser auth is simple, hackathon-grade:** passwords are hashed with Node's `crypto.scrypt` and a random salt and compared with `timingSafeEqual`. The session is an httpOnly, SameSite=Lax cookie (`cb_session`) HMAC-signed with `AUTH_SECRET`, valid for 30 days. No email verification or password reset yet.
- Organisers can only decide for their own team; the team always comes from the session, never the request.
- Publishing is an idempotent conditional update (only from an open status), so simultaneous accepts publish, log and notify exactly once.

## Keeping the docs accurate

- The rules every agent (and human) follows are in `AGENTS.md` ("Documentation contract"). `docs/HANDOFF.md` is the technical handoff, `docs/openapi.yaml` the bot API, and `docs/CHANGELOG.md` the integrator-facing changelog.
- `npm run docs:check` verifies the docs against the code (routes, env vars, file paths, enums, webhook types, and an OpenAPI lint).
- The pre-commit hook (`.githooks/pre-commit`, installed by `npm install`) runs `typecheck` and `docs:check`, and requires a CHANGELOG entry when `app/api`, `lib` or `supabase` change. Bypass with `git commit --no-verify` **only in emergencies**, and fix it in the next commit.
- CI (`commgrok-ci.yml` in the repo-root `.github/workflows/`) runs typecheck, build, docs:check and `npm run smoke` whenever `apps/commgrok` changes, and stamps HANDOFF.md on `main`. `commgrok-docs-drift.yml` comments on PRs that change code without docs.
- Optional: label a PR `update-docs` and Claude updates the docs for you (`commgrok-claude-docs.yml` in the repo-root `.github/workflows/`). To turn it on, add the repo secret `ANTHROPIC_API_KEY` and create the `update-docs` label. It's off unless both exist.

## License

MIT. See [LICENSE](LICENSE).
