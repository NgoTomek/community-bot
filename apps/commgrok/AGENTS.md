<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CommGrok: agent rules

CommGrok is a lightweight Luma for London communities. Bots propose events through an API (`X-API-Key`). Organisers (email + password accounts, one team each, sign-up needs an invite code) **Accept**, **Reject** (final) or **Send back to bots** (a note is required). The bot sends back a revised version, which bumps `revision` and resets every approval. When every required team has accepted the current revision, the event publishes exactly once to a public calendar, where guests RSVP without an account (and join a waitlist when it's full).

Read first:
- `README.md`: features, quickstart and the live demo script.
- `lib/workflow.ts`: the workflow contract (the comment at the top) plus every mutation. Read it before you touch statuses, decisions, revisions or webhooks.
- `docs/HANDOFF.md`: architecture, flows, the state machine, the env table and the ✅ / ⚠️ / ❌ status of each feature.
- `docs/openapi.yaml`: the bot-facing API. Integrators treat it as the source of truth.
- `docs/CHANGELOG.md`: what changed, written for integrators.

Stack: Next.js 16 App Router, TypeScript (strict), Tailwind 4 and zod. Storage is a local JSON store or Supabase (`lib/store/`). It's also a PWA, with live updates over SSE or Supabase broadcast.

## Documentation contract

Docs ship with the code: a change isn't done until the docs match it.

| If you change… | Update in the SAME commit |
| --- | --- |
| API routes or request/response shapes | The relevant section of `docs/HANDOFF.md`, plus `docs/openapi.yaml` for anything the bots use |
| Statuses, decisions or the approval flow | HANDOFF.md, including its **state-machine and sequence diagrams**, plus the enums in `docs/openapi.yaml` |
| Webhook payloads or types | The webhook section of HANDOFF.md, plus `docs/openapi.yaml` |
| Env vars | `.env.example`, plus the env table in HANDOFF.md |
| The store or the DB schema | HANDOFF.md, plus a new timestamped migration in `supabase/migrations/` (never rewrite one that a shared DB has already applied) |
| Auth (sessions, passwords, API key, invite code) | HANDOFF.md |
| Demo scripts (`npm run demo:*`) | HANDOFF.md, plus the README demo script |
| **Any of the above** | `docs/CHANGELOG.md`, under `## [Unreleased]`. This one is **always** required. |

Rules:
1. **Breaking changes for the bot platform** go in the CHANGELOG marked `⚠️ BREAKING (integrators)`, with numbered **Migration** steps: what the bot side must change, and how long any alias or fallback will last.
2. **Run `npm run docs:check` before you finish any task, and fix every failure.** It checks:
   - routes under `app/api/` against the paths in `docs/openapi.yaml`;
   - env vars used in code against `.env.example` and the HANDOFF.md env table;
   - that file paths cited in backticks in `docs/*.md` exist;
   - that the status, decision and webhook-type enums (`lib/types.ts`) match the docs;
   - that `docs/openapi.yaml` passes the Redocly lint;
   - in the pre-commit hook only, that `docs/CHANGELOG.md` is staged whenever `app/api/`, `lib/` or `supabase/` change.
3. **Keep the ✅ / ⚠️ / ❌ labels in HANDOFF.md current.** ✅ means built and verified, ⚠️ means partial or has a known caveat, ❌ means not built. If you change a feature, re-check its label.
4. **Leave the machine-checked markers in HANDOFF.md intact.** These are the comment markers that `docs:check` parses: `<!-- docs:stamp -->`, `<!-- docs:event-statuses -->`, `<!-- docs:decisions -->`, `<!-- docs:webhook-types -->` and `<!-- docs:env -->`, each with a matching closing `<!-- /docs:… -->`. In `docs/openapi.yaml` the checker also parses the `EventStatus`, `Decision` and `WebhookType` schemas (single-line `enum: [...]`) and the 2-space path / 4-space method keys under `paths:`. Edit the content between them, but never delete, rename or reorder the markers. If a check can't find one, put the marker back rather than changing the checker.
5. **The pre-commit hook** is `.githooks/pre-commit`, installed by `npm install` through the `prepare` script. It runs `npm run typecheck && npm run docs:check`. Use `git commit --no-verify` **only in an emergency**, and fix the failure in the very next commit.

## Working rules

- **TypeScript strict.** `npm run typecheck` must pass. Don't silence errors with `any` or `@ts-ignore`.
- **Times are Europe/London.** Store ISO 8601 with an offset. Display times and `.ics` files in Europe/London (helpers in `lib/time.ts`), and handle the BST/GMT changeover.
- **Bot auth is a contract.** The bot endpoints authenticate with `X-API-Key` = `PROPOSALS_API_KEY`. Never change the header, the key semantics or which endpoints need the key without a `⚠️ BREAKING (integrators)` CHANGELOG entry.
- **Every mutation goes through `lib/workflow.ts`.** The deciding team always comes from the session, never from the request body. Publishing stays idempotent (exactly once), and a revision always resets approvals.
- **Keep local mode zero-setup.** With the `SUPABASE_*` vars empty, `npm install && npm run dev` must just work, and `npm run demo:reset` must restore the seed data. New features need a local-store path as well as a Supabase path.
- **Don't commit secrets.** Real values go in `.env.local`, which is gitignored, as is the local data dir. `.env.example` holds placeholders only.
