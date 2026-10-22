# Sample run

A fixed mock run is loaded in the `community-bots` Supabase project so the phone app can be built before a worker has negotiated anything. Re-running `npm run seed:sample` (once `apps/worker/.env` has the service role key) resets this run to pending, round 1. The event date is the next Thursday at least 14 days ahead, computed when the seed runs. It is not a hardcoded date.

The organiser passcode for this demo is `community` (`settings.organiser_passcode`). Change it before any real community uses the project.

## Project

| | |
|---|---|
| Ref | `mcxhcehbzqxyarjqvihy` |
| URL | `https://mcxhcehbzqxyarjqvihy.supabase.co` |
| Anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jeGhjZWhienF4eWFyanF2aWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODY1MzksImV4cCI6MjEwODI2MjUzOX0.4yzX8r7v8ih5pX0JZzw_STJYCkoYwwKyxhH4utCDCVQ` |

The anon key is public. Row level security is what keeps approvals, inbox tokens, the passcode, RSVPs and Luma rows unreadable. The service role key is not in this repo. Paste it into `apps/worker/.env` as `SUPABASE_SERVICE_ROLE_KEY`.

Dashboard: <https://supabase.com/dashboard/project/mcxhcehbzqxyarjqvihy/settings/api-keys>

## Phone paths

Run `11111111-1111-4111-8111-111111111111`. Deal `22222222-2222-4222-8222-222222222222`. Backend `mock`. All three approvals start `pending`.

| Community | Request | Inbox |
|---|---|---|
| Atlas Lab (`sample-atlas`) | `/r/a1111111-1111-4111-8111-111111111111` | `/inbox/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| Harbor House (`sample-harbor`) | `/r/b2222222-2222-4222-8222-222222222222` | `/inbox/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |
| Signal Club (`sample-signal`) | `/r/c3333333-3333-4333-8333-333333333333` | `/inbox/cccccccc-cccc-4ccc-8ccc-cccccccccccc` |

Prefix those paths with the phone app origin. The web app reads that origin from `VITE_PHONE_BASE_URL`.

## RPCs the phone app calls

Use supabase-js `.rpc(name, args)` with the anon key. Do not read `approvals` directly.

`get_request(p_token uuid)` → jsonb

```json
{
  "token": "uuid",
  "status": "pending",
  "note": null,
  "round": 1,
  "history": [{ "round": 1, "decision": "approved", "note": null, "at": "timestamptz" }],
  "community": { "id": "sample-atlas", "name": "Atlas Lab" },
  "deal_id": "uuid",
  "deal": {},
  "others": [{ "community_id": "sample-harbor", "name": "Harbor House", "status": "pending", "note": null }]
}
```

`others` never includes tokens or inbox tokens.

`list_requests(p_inbox uuid)` → jsonb array, newest first, for the community whose `inbox_token` matches. Each item is `{token, status, round, deal_id, title, date, updated_at}`. An unknown inbox returns `[]`.

`respond(p_token uuid, p_decision text, p_note text default null, p_quick jsonb default [])` → `{status}`.

Decisions are `approved`, `declined`, or `renegotiate`. `declined` and `renegotiate` need a note of at least 3 characters. The call only works while that approval is `pending`; otherwise it raises `This request is no longer pending`. It appends `{round, decision, note, at}` to `history` and does not rotate the token. The run status flips when the worker next polls, not inside `respond` itself.
