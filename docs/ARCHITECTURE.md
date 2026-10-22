# Architecture

Three programs, one Postgres database.

```
Browser (apps/web)              Supabase                         Worker (apps/worker)
------------------              --------                         --------------------
submit_job / save_card  ───▶    jobs queue  ◀── claim_job() ───  service role only
realtime + 2s poll      ◀───    runs, messages, deals, jobs
presenter_status (2s)   ───▶    approvals (not readable, not realtime)
get_event / rsvp        ───▶    deals, announcements, rsvps

Phone (apps/phone, separate repo)
get_request / list_requests / respond
```

The phone app is not in this repo. It must keep calling `get_request(p_token uuid)`, `list_requests(p_inbox uuid)`, and `respond(p_token uuid, p_decision text, p_note text, p_quick jsonb)`. Return shapes are in [SAMPLE.md](SAMPLE.md).

Anon may select `runs`, `messages`, `deals`, `announcements`, `jobs`, and the `communities_public` view. Inserts, updates, and deletes from the browser go through the functions in `supabase/migrations/0001_init.sql`. `claim_job()` uses `FOR UPDATE SKIP LOCKED` and is granted only to `service_role`.

`respond` records the organiser's decision and appends `{round, decision, note, at}` to history. It does not change `runs.status`. The worker polls every 2 seconds and moves the run with a compare-and-set on `status = pending_approval`, so two polls cannot process the same wave. A decline ends the run. A renegotiation rewrites the deal and updates the approval rows in place (same token, round + 1). Round 3 is the last. When every approval is `approved`, the run becomes `confirmed`. `get_event.all_approved` is computed from the approval rows.

## Organisers in the loop

`post_message(p_passcode, p_run_id, p_text, p_as_community)` adds a human message (1 to 600 characters, 50 per run) to a run that has not ended. With `p_as_community` it must be the lead or a partner, and it fills `messages.community_id` and `messages.as_community`. `set_run_control(p_passcode, p_run_id, p_action)` sets `runs.control` to `running`, `paused` or `stopped` and returns `{run_id, control, status}`. Both check the organiser passcode. `messages.seq` is assigned by the database (max + 1 per run under an advisory lock), because organisers and the worker write to the same conversation at once.

Before every Bot turn, `runNegotiation` asks an `OrganiserChannel` (`packages/core/src/control.ts`) what happens next. The worker feeds it from the database (`apps/worker/src/runControl.ts`):

- `paused`: wait. A pause longer than 30 minutes counts as a stop, so one run cannot hold the single-job worker.
- `stopped`: end the negotiation. The worker sets the run to `declined` with `decline_reason = 'stopped by organiser'`. A stop while a deal is out for responses declines the run inside `set_run_control`.
- New general posts become "Organiser guidance" in every later turn prompt, inside a `<data>` block that says it cannot override the Bot's standing rules.
- A post made for a community replaces that community's next Bot turn. The stance is read from the words (anything not clearly a yes counts as a counter, so the lead responds) and stored on the message.

The worker upserts `worker_status (id = 1, backend)` every 10 seconds; the database stamps `last_seen`. `get_worker_status()` returns `{online, backend, last_seen}`, online meaning seen within 30 seconds. Anon cannot read the table.

Runs from `npm run seed:sample` have `runs.is_sample = true`. `reset_sample_runs()` (service role, `npm run demo:reset`) puts only those back to round 1: approvals pending, history, notes and quick reasons cleared, tokens kept and pointing at the round-1 deal, RSVPs on the run's deals removed. Chat messages are left alone.

Every run stores `backend` (`grokbot`, `openai`, or `mock`). Mock output is labelled in the UI. Evidence quotes are rechecked in the browser with `verifyEvidence`; the stored flag is not trusted.

Bot names are `cb-<communityId>`, `cb-scout`, `cb-matchmaker`, and `cb-scribe`. The grokbot backend shells out to `scripts/grokbot.py` with `status`, `list`, `create`, `update`, `chat`, `send`, and `transcript`.
