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

Every run stores `backend` (`grokbot`, `openai`, or `mock`). Mock output is labelled in the UI. Evidence quotes are rechecked in the browser with `verifyEvidence`; the stored flag is not trusted.

Bot names are `cb-<communityId>`, `cb-scout`, `cb-matchmaker`, and `cb-scribe`. The grokbot backend shells out to `scripts/grokbot.py` with `status`, `list`, `create`, `update`, `chat`, `send`, and `transcript`.
