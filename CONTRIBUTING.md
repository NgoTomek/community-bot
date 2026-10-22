# Contributing

Community Bots is meant to be readable. A judge, and the next organiser who clones it, should be able to follow a job from the button to the event page without a map.

## Layout

- `packages/core` — pure logic. Schemas, evidence checks, deal rules, prompts, the orchestrator, the three backends. No Supabase, no React.
- `apps/worker` — the only process with the service role key. Polls `jobs`, runs core, writes rows.
- `apps/web` — static React app. Writes only through security-definer RPCs (`submit_job`, `save_card`, `post_message`, `set_run_control`, `rsvp`) and reads the public tables.
- `supabase/migrations` — the whole database, applied in filename order. `supabase/tests` checks it.

`docs/ARCHITECTURE.md` is the contract: table shapes, job types, the chat protocol, and which function lives where. If you change a job result or a prompt, update that doc in the same change.

## Rules that keep the product honest

- No community name and no scenario in logic. Matching, negotiation and the mock backend must work for cards they have never seen. Tests should use made-up communities.
- No hard-coded date. Use the system clock (`new Date()`), and let tests pass a `now`.
- A fact on screen must come from a card or from the transcript. The browser recomputes `verifyEvidence`; do not trust a stored `verified` flag.
- `BACKEND=mock` output is sample data. The UI must say so. Never present it as a real Bot run.
- The web app must not import `@community-bots/core/backends` or the orchestrator, and must never see `SUPABASE_SERVICE_ROLE_KEY`.

## Checks

```bash
npm test
npm run lint
npm run build
npm run test:db   # needs Docker; applies every migration to a throwaway database
```

These run in GitHub Actions on every push and pull request.

## Adding a backend

Implement `Backend` in `packages/core/src/backends` (`ask`, `name`, `canBrowse`) and register it in `createBackend`. If it cannot browse, the worker fetches public pages and passes them in. Standing rules go in `ask({ standingRules })`; do not put secrets in a prompt.

## Database changes

Add a new file to `supabase/migrations`; never edit one that has been applied. Do not rename or reshape an existing RPC: the phone app depends on `get_request`, `list_requests` and `respond`. Add a test in `supabase/tests` (it runs as `anon` and `service_role` inside a rolled-back transaction), and record any change to what anon can do in `docs/SECURITY.md`.
