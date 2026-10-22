# Security

This is a demo-grade deployment. The interesting boundary is real: the browser never holds the service role key, and it cannot read approval tokens, inbox tokens, the organiser passcode, RSVPs, or Luma rows. Those move through security-definer functions with a fixed `search_path`.

## What the anon key can do

The anon key is public. With it, someone can:

- Read runs, messages, deals, announcements, jobs, and community cards.
- Call `get_request` / `list_requests` / `respond` if they know a token or inbox token.
- Call `submit_job`, `save_card`, `presenter_status`, `post_message`, and `set_run_control` if they know the organiser passcode.
- RSVP to an event.
- Ask `get_worker_status()` whether a worker is online. It returns only `online`, `backend`, and `last_seen`.

They cannot `SELECT` `approvals`, `community_secrets`, `settings`, `rsvps`, `luma_events`, or `worker_status`, and cannot insert into `messages` directly. That is enforced by grants, not just by hiding the tables in the UI. `claim_job` and `reset_sample_runs` are granted only to `service_role`; `reset_sample_runs` only ever touches runs where `is_sample` is true.

The Supabase security advisor still warns that the phone and web RPCs are security-definer functions executable by `anon` and `authenticated`. That is intentional. Revoking them would break the phone app. The warnings and their notes:

- [Anon can execute security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Signed-in users can execute security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

`require_passcode`, `claim_job`, and `reset_sample_runs` are not in that list; anon cannot call them.

Organiser messages reach the Bots as data. General posts sit in an "Organiser guidance" `<data>` block that says it cannot override the standing rules; a post made for a community stands in for that community's reply and goes into the transcript the same way as any other message.

## What to harden before real communities

- Change `settings.organiser_passcode`. The migration default is `community` so a fresh clone works.
- The passcode check is a plain comparison. Rate-limit `submit_job`, `save_card`, `presenter_status`, `post_message`, `set_run_control`, and `respond` at the edge.
- Jobs are world-readable, including their params. Do not put secrets in params. A production version would scope job reads to the organiser who created them.
- Approval tokens are bearer links. Treat a leaked `/r/:token` URL like a login.
- `respond` does not check that the caller is a particular person. Possession of the token is the capability.
- The Scout must stay on public pages. The grokbot standing rules say so, but the model can still wander. Review cards before confirming them.
- Turn on Supabase network restrictions for the service role, and do not ship `apps/worker/.env`.
- Luma keys stay in the worker environment, scoped to one calendar.
