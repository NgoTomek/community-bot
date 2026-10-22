# CommGrok: brief for the bot platform's coding agent

You're integrating the bot platform with CommGrok. This brief gives you the essentials. For the details:
- `docs/openapi.yaml` is the **source of truth** for the API.
- `docs/HANDOFF.md` describes the flow, the state machine and the env vars.

If this brief disagrees with either of those, they win.

## What CommGrok is

CommGrok is a lightweight Luma for London communities. The cycle runs like this:

1. **Bots propose** events over an API.
2. **Organisers decide.** They have email + password accounts with one team each, and each required team chooses one of:
   - **Accept**.
   - **Send back to bots**, with a required note asking for changes.
   - **Reject**, which is final.
3. **Bots revise** when an event is sent back. Each revision bumps `revision` and resets every approval.
4. **The event publishes** exactly once, when every required team has accepted the current revision. In the `any_organiser` approval mode, one accept is enough.
5. **Guests RSVP** on the public calendar, with no account. There's a waitlist when the event is full, plus .ics files and a calendar feed.

Statuses: `proposed` → (`renegotiating` ⇄ `proposed`) → `published` | `rejected`. A published event can later become `cancelled`. Only `published` and `cancelled` events are public.

## Your responsibilities (bot side)

1. **Propose** events with `POST /api/proposals`.
2. **Poll for renegotiating events** with `GET /api/proposals?status=renegotiating`, every 30–60 s for example. Do this even if you also use webhooks.
3. **Revise.** For each renegotiating event:
   - Read `latest_note.note`.
   - Change only what the note asks for.
   - Send the changed fields, plus a short `message`, with `PUT /api/proposals/{id}`.

   After a successful PUT the event goes back to `proposed`, so it drops out of the poll list and you won't revise twice for the same note.
4. **Handle webhooks** if a URL is configured. Branch on `type`:
   - `event.published`: done. Store `event.url`.
   - `event.rejected`: final. Stop, and don't re-propose it automatically.
   - `event.renegotiate`: revise, as in step 3.

   Make your handler idempotent.
5. **Never publish directly.** Only organisers publish, by accepting. The bots have no publish or approve endpoint. Never call the organiser decision route or impersonate an organiser session.
6. **Respect `409`.** It means the event is `rejected`, `published` or `cancelled`, or the state changed under you. Stop working on that event.

## Bot API at a glance

| Method & path | Purpose | Key points |
| --- | --- | --- |
| `POST /api/proposals` | Create a proposal | Returns `201` with the event JSON (`id`, `slug`, `status`, `url`, `review_url`, …). `400` = validation failure, `401` = bad key. Dates are ISO 8601 with an offset; the timezone defaults to Europe/London. |
| `GET /api/proposals?status=renegotiating` | Poll for feedback | Returns `{ items: [ event + latest_note ] }`, where `latest_note` is `{ decision, note, by, team, at, revision }`. Leave out `status` to get every open proposal. |
| `PUT /api/proposals/{id}` | Send a revised version | `{id}` is the id or the slug. Send partial fields plus an optional `message`. Bumps `revision`, resets approvals, sets the status to `proposed`. `409` if the event is rejected, published or cancelled. |
| `GET /api/events/{id}` | Read one event | Returns `status`, `approvals.teams[]` (each with `state` and `note`), `latest_note` and `rsvps`. |

- **Decisions**: `approved | rejected | renegotiate`.
- **Team `state`**: `waiting | approved | rejected | renegotiate | stale`.
- **Legacy values**: `changes_requested` is gone, replaced by `renegotiating` / `renegotiate`. See `docs/CHANGELOG.md`, 0.3.0.

**Webhook.** CommGrok POSTs to `EVENTS_WEBHOOK_URL` (the legacy alias `PUBLISH_WEBHOOK_URL` is used only when that's empty):

```json
{ "type": "event.published | event.rejected | event.renegotiate",
  "event": { "id": "…", "slug": "…", "title": "…", "status": "…", "url": "…" },
  "note": "…or null", "decided_by": "…or null", "team": "…or null" }
```

## Auth

- **Every bot request sends the header `X-API-Key: <PROPOSALS_API_KEY>`.** The key is a shared secret, set as an env var on the CommGrok deployment. A missing or wrong key gets `401`.
- **Keep the key server-side only.** Never put it in client code, prompts, logs or git. To rotate it, change it on both sides.
- **Bot endpoints don't use cookies.** Organiser sessions (`cb_session`) are for humans only.

## Run CommGrok locally

```bash
npm install                    # also installs the pre-commit hook
cp .env.example .env.local     # set PROPOSALS_API_KEY and AUTH_SECRET; leave SUPABASE_* empty (local mode)
npm run dev                    # http://localhost:3000
npm run demo:reset             # seed events + demo organisers
npm run demo:propose           # a bot proposes an event
npm run demo:revise            # the bot answers the latest send-back note (or: -- <id|slug|latest>)
npm run smoke -- --base http://localhost:3000 --key <key>   # end-to-end check of the bot API
```

- **Demo organisers**: `tom@commgrok.demo` and `maya@commgrok.demo`, both with password `demo1234`. The login page has one-tap demo buttons.
- **To test webhooks**, set `EVENTS_WEBHOOK_URL` in your .env.local to a local receiver or a request bin, then restart the server.

## Documentation contract (you must follow this too)

- **Follow `AGENTS.md`** in this repo. Its rules apply to you as much as to CommGrok's own agents.
- **Log every change** in `docs/CHANGELOG.md` under `## [Unreleased]`, in the same commit as the change.
- **Mark changes that break integrators** with `⚠️ BREAKING (integrators)`, and include numbered **Migration** steps.
- **API changes** (routes, request/response shapes, statuses, decisions, webhook payloads) mean updating `docs/openapi.yaml` and the relevant section of `docs/HANDOFF.md`.
- **Env changes** mean updating `.env.example` and the env table in HANDOFF.md.
- **Run `npm run docs:check` before you finish, and fix every failure.**
- **Never bypass the pre-commit hook** with `--no-verify`, except in a real emergency. If you do, fix the failure in the very next commit.
