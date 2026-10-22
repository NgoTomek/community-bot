# Changelog

This file records every notable change to CommGrok. It's written first for **integrators** (the bot platform team) and second for organisers and maintainers.

- The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Before 1.0, a minor bump may contain breaking changes.
- Each release uses these subsections as needed: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.
- **⚠️ BREAKING (integrators)** marks a change the bot platform must act on. Every one comes with numbered **Migration** steps.
- The bot API contract lives in `docs/openapi.yaml`. The flow, state machine and env table live in `docs/HANDOFF.md`.
- The rules for updating this file are in `AGENTS.md` (Documentation contract).

## [Unreleased]

<!--
  Agents: append your entries here, in the SAME commit as the code change (the pre-commit hook checks for this).
  Use the Added / Changed / Deprecated / Removed / Fixed / Security subsections.
  Mark bot-facing breaks "⚠️ BREAKING (integrators)" and include numbered Migration steps.
-->

### Added
- **Docs that stay accurate:** `docs/HANDOFF.md` (flow, state machine, sequence diagrams, env table, ✅/⚠️/❌ status), `docs/openapi.yaml` (OpenAPI 3.1 for every `app/api` route plus the webhook), `docs/AGENT_BRIEF.md`, and the documentation contract in `AGENTS.md` (`CLAUDE.md` points to it).
- `npm run docs:check` (`scripts/docs-check.mjs`): checks routes against `docs/openapi.yaml`, env vars against `.env.example` and the HANDOFF env table, cited file paths, the status/decision/webhook enums, a CHANGELOG entry on commits that touch `app/api`, `lib` or `supabase`, and runs a Redocly lint. `--stamp` writes the "Last verified" line.
- Pre-commit hook `.githooks/pre-commit` (typecheck + docs:check), installed by `npm install` through the `prepare` script.
- CI: `../../.github/workflows/commgrok-ci.yml` (typecheck, build, docs:check, smoke test, stamp on `main`), `../../.github/workflows/commgrok-docs-drift.yml` (PR comment when code changes without docs), and the optional `../../.github/workflows/commgrok-claude-docs.yml` (label `update-docs`, needs the `ANTHROPIC_API_KEY` secret).
- `npm run smoke -- --base <url> --key <key>` (`scripts/smoke.mjs`): end-to-end test of propose, accept, renegotiate, revise, publish, RSVP and reject.
- `npm run db:check` (`scripts/db-check.mjs`): verifies a Supabase project (tables and row counts, RLS for the anon key, a Realtime broadcast round trip).
- README: "Database: Supabase" setup guide with a what-lives-where table and troubleshooting.

### Changed
- Moved into the `community-bot` monorepo as `apps/commgrok` (package `@community-bots/commgrok`). CI workflows are prefixed `commgrok-*.yml` at the repo root and only run when `apps/commgrok` changes. The pre-commit hook (installed by `scripts/install-hooks.mjs`) only runs for commits that touch this app.
- `proxy.ts` (Next 16 middleware) returns a real `404` for non-public event pages and a `307` to `/login?next=…` for organiser pages when logged out.
- Removed the root and event-page `loading.tsx` skeletons, which made `notFound()` and `redirect()` return HTTP 200.
- `.env.example` lists `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_CALENDAR_NAME`, and marks which Supabase keys are server-only.

### Fixed
- **Supabase mode parity** (`lib/store/supabase.ts`): `npm run demo:reset` / `POST /api/demo/reset` now work in Supabase mode (same seed as local mode via `buildSeed()`, demo users restored, other accounts kept). Timestamps are read back as `toISOString()` like the local store, so sorting and the revision diff no longer flag unchanged `start_at`/`end_at`. Non-uuid ids return "not found" instead of a Postgres error, and store reads are never cached by Next.js.
- `supabase/seed.sql` no longer runs `truncate … teams cascade`, which also emptied `public.users`.
- New migration `supabase/migrations/20261022180000_supabase_parity.sql`: explicit grants for the service role and public keys (RLS unchanged) plus two `created_at` indexes. Idempotent.

## [0.3.0] - 2026-10-22

This release adds the organiser-only model, the three decisions and the bot renegotiation loop.

### Added
- **Three organiser decisions**, set per team through `POST /api/events/{id}/decision` with a session cookie:
  - `approved` is the **Accept** button.
  - `renegotiate` is the **Send back to bots** button. A note is required (at least 3 characters), otherwise the API returns `400`.
  - `rejected` is the **Reject** button. It's final, and the reason is optional.
  - Reject and send-back win over pending accepts. Only open events (`proposed`, `renegotiating`) can be decided; anything else returns `409`.
- **The bot can poll for feedback** with `GET /api/proposals?status=renegotiating`. It returns `{ items: [...] }`, where each item is the event JSON plus `latest_note`: `{ decision, note, by, team, at, revision }`. Leave out `status` to get every open proposal.
- **The bot can send a revised version** with `PUT /api/proposals/{id}`. The `{id}` can be the event id or its slug. Send only the fields that changed, plus an optional `message`. A revision bumps `revision`, resets every approval and sets the status back to `proposed`. The API returns `409` if the event is `rejected`, `published` or `cancelled`.
- **`GET /api/events/{id}` returns more detail**: `approvals.teams[]` now has a `state` and a `note` per team, and the response has a top-level `latest_note`. Team `state` is one of `waiting | approved | rejected | renegotiate | stale`, where `stale` means the team accepted an earlier revision.
- **New webhook types**: `event.rejected` and `event.renegotiate`, alongside `event.published`. See Changed for the payload.
- **Approval mode**: the `NEXT_PUBLIC_APPROVAL_MODE` env var takes `all_teams` (the default: every required team must accept the current revision) or `any_organiser` (one accept publishes).
- **Activity log entries** for "Sent back: …" and for "Revised by bot", which shows a small diff of the changed fields.
- **`npm run demo:revise`** (`scripts/demo-revise.mjs`) plays the bot: it reads the latest note and sends a revision. You can target an event with `npm run demo:revise -- <id|slug|latest>`.
- **The organiser inbox** (the /approvals page) is split into "Needs decision" and "With bots".

### Changed
- **⚠️ BREAKING (integrators): `changes_requested` is replaced by `renegotiate` and `renegotiating`.**
  - Decisions are now `approved | rejected | renegotiate`.
  - Statuses are now `proposed | renegotiating | rejected | published | cancelled`.
  - The value `changes_requested` is no longer returned anywhere. Old stored rows are still read correctly: they're mapped to `renegotiating` (status) and `renegotiate` (decision) in `lib/types.ts`, so no data migration is needed.
  - `rejected` is now a terminal status: a rejected event can't be revised or decided again.

  **Migration:**
  1. Replace every check for `changes_requested`: use `renegotiating` when comparing an event's `status`, and `renegotiate` when comparing a decision or a team's `state`.
  2. To find work, poll `GET /api/proposals?status=renegotiating` and act on each item's `latest_note.note`.
  3. Treat `rejected` as final. Stop working on that event and don't re-propose it automatically.
  4. Treat any enum value you don't recognise as "no action": log it, and don't crash.
- **⚠️ BREAKING (integrators): webhooks are generalised, and the env var is renamed.**
  - The webhook URL is now `EVENTS_WEBHOOK_URL`. `PUBLISH_WEBHOOK_URL` still works, but only when `EVENTS_WEBHOOK_URL` is empty (see Deprecated).
  - The receiver now gets **three** types: `event.published`, `event.rejected` and `event.renegotiate`. Not every POST is a publish any more.
  - The payload is `{ type, event, note, decided_by, team }`. `note`, `decided_by` and `team` are `null` when they don't apply.
  - Each delivery attempt is recorded in the event's activity log.

  **Migration:**
  1. Set `EVENTS_WEBHOOK_URL` on the CommGrok deployment to your receiver, and remove `PUBLISH_WEBHOOK_URL`.
  2. Branch on `type` in your receiver:
     - `event.published`: done. Store `event.url`.
     - `event.rejected`: final. Stop work on the event.
     - `event.renegotiate`: read `note`, then send a revision with `PUT /api/proposals/{id}`.
  3. Make the receiver idempotent. Because `event.published` fires exactly once per event, key on `type` + `event.id`.
  4. Don't rely on webhooks alone. Keep polling `GET /api/proposals?status=renegotiating` as the fallback.

### Deprecated
- `PUBLISH_WEBHOOK_URL`: this legacy alias is used only when `EVENTS_WEBHOOK_URL` is empty. It will be removed in a future release, which will be marked BREAKING.
- Reading legacy `changes_requested` data: CommGrok still maps it on read, for old local and Supabase data only.

### Removed
- **Public accounts.** The public never logs in: the calendar, event pages and RSVPs need no account. Every account is now an organiser with a team.

### Security
- **Sign-up needs an invite code** (`ORGANISER_INVITE_CODE`, default `commgrok`). Change it for any shared deployment.
- **The deciding team always comes from the session**, never from the request body. A team that isn't required for the event gets `403`.

## [0.2.0] - 2026-10-22

This release adds organiser accounts and a visual refresh. The bot API is unchanged.

### Added
- **Email + password organiser accounts**, with login, sign-up, logout and team selection (the routes under /api/auth).
- **Demo organisers**: `tom@commgrok.demo` (Builders Collective) and `maya@commgrok.demo` (Canal Works), both with password `demo1234`. The login page has one-tap "Demo: sign in as…" buttons for them.
- **The `AUTH_SECRET` env var**: the HMAC key for the session cookie.
- **Visual refresh**: a violet→pink palette, a colour for each event type, confetti on publish, loading skeletons and dark mode.

### Security
- **Passwords are hashed with scrypt** (`lib/password.ts`).
- **The organiser session is the HMAC-SHA256 signed `cb_session` cookie** (`lib/session.ts`), signed with `AUTH_SECRET`. It replaces the unsigned `cb_team` cookie, which could be forged to act as any team.
  - Changing `AUTH_SECRET` logs everyone out.
  - If `AUTH_SECRET` is empty, a dev-only default is used. **Always set it in production.**

### Removed
- **The unsigned `cb_team` cookie**, which acted as a team picker with no login.

## [0.1.0] - 2026-10-22

The initial release.

### Added
- **Bot API** (`X-API-Key` = `PROPOSALS_API_KEY`):
  - `POST /api/proposals` creates a proposal and returns `201` with the event JSON (`id`, `slug`, `status`, `url`, `review_url`, …). Errors: `401` for a bad key, `400` for a validation failure.
  - `GET /api/events/{id}` (by id or slug) lets the bot poll status, approvals and RSVPs.
- **Publish webhook**: when an event publishes, CommGrok POSTs `event.published` to `PUBLISH_WEBHOOK_URL`.
- **Approval workflow** (`lib/workflow.ts`):
  - Two-team approval. By default every team is required, or the proposal can set `required_team_ids`.
  - An idempotent publish rule: publishing is a conditional update, so an event publishes exactly once.
  - Edits reset approvals through a `revision` counter, because approvals only count for the current revision.
- **Public calendar** with Upcoming/Past tabs and type filters.
- **Event pages** with guest RSVP and an automatic waitlist when the event is full.
- **Calendar files**: an .ics file per event, and a subscribable `GET /calendar.ics` feed.
- **Installable PWA** that works offline for pages you've already opened.
- **Live updates**: server-sent events in local mode (`GET /api/live`), or Supabase broadcast in Supabase mode.
- **Two backends**:
  - A local JSON store with zero setup.
  - Supabase, with the schema in `supabase/migrations/20261022000000_init.sql` and seed data in `supabase/seed.sql`.
- **Demo scripts**: `npm run demo:propose` (`scripts/demo-propose.mjs`) and `npm run demo:reset` (`scripts/demo-reset.mjs`, or `POST /api/demo/reset`).
