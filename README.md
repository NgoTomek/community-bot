# Community Bots

An open-source tool for community organisers. Paste a public link, a Bot drafts a community card, the organiser confirms it, then states a need. Bots for the communities involved negotiate who brings what. Each organiser accepts, declines, or asks to renegotiate on their phone. When everyone accepts, a public event page goes live.

It is not one scripted scenario. Any community card can lead, and any other cards can be the partners. Another group can clone this repo and run the mock flow in about 10 minutes.

MIT licensed. The organiser phone app (`/r/:token` and `/inbox/:inboxToken`) is a separate package and is not in this repo. It talks to Postgres only through `get_request`, `list_requests`, and `respond`. See [docs/SAMPLE.md](docs/SAMPLE.md).

## Flow

1. Add a community from a public URL. The Scout Bot drafts a card. The organiser edits it and confirms it.
2. They state a need and pick up to three matches. Evidence on every reason is checked against the named card.
3. Community Bots negotiate in a group chat. The Scribe compiles a deal only from what was agreed. The date has to be in the future and on a day every community allows. Capacity has to fit every maximum that is set.
4. Each organiser gets a phone link. They accept, decline, or renegotiate. Notes are data, not instructions. Three rounds maximum.
5. When everyone has accepted, the event page flips from Draft to Confirmed.

Dates always come from the system clock.

## 10-minute setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` then `supabase/migrations/0002_rls_advisor.sql` in the SQL editor (or apply them with the Supabase MCP).
3. Copy `.env.example` to `.env` at the repo root and fill in the URL and anon key.
4. Paste the service role key into `apps/worker/.env` as `SUPABASE_SERVICE_ROLE_KEY`. That file is gitignored. Never put this key in the web app.
5. `npm install`
6. Install the Grok Bot skill if you want real Bots: `npx skills add adamanz/grok-bot-skill -g -a cursor`. The CLI lands at `~/.cursor/skills/grok-bot/scripts/grokbot.py`. For a first run, leave `BACKEND=mock`.
7. `npm run worker` in one terminal and `npm run dev` in another.
8. `npm run seed:sample` loads the fixed demo run. `npm run seed` queues draft cards for the communities in `seed/communities.json`.

`BACKEND=openai` uses any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). `BACKEND=grokbot` uses the Grok Bot desktop app via the skill CLI. Mock runs are stamped `backend: mock` and the UI shows **Sample data, not a real Bot run**.

The demo organiser passcode is `community`. Change `settings.organiser_passcode` before real use.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Web app |
| `npm run worker` | Job runner and approval poll |
| `npm test` | Unit tests (no database) |
| `npm run test:rpc` | Calls every RPC with the sample tokens. Needs the env vars. |
| `npm run seed:sample` | Resets the fixed sample run |
| `npm run seed` | Queues draft-card jobs from `seed/communities.json` |
| `npm run build` | Typecheck and build the web app |

## Defaults chosen so the project runs

- Region for the hosted project: London (`eu-west-2`).
- Phone origin: `VITE_PHONE_BASE_URL`, default `http://localhost:5174` in `.env.example`.
- Suggested event dates are at least 14 days ahead, on a weekday every involved community allows.
- A declined organiser ends the run. A renegotiation request is handled only if nobody declined. Round 3 is the last deal.
- Without `LUMA_API_KEY`, publishing returns a copyable payload and an `.ics` file labelled export, not published.

## Layout

`packages/core` is the shared library. `apps/web` is the static React app. `apps/worker` holds the service role key and is the only process that writes runs, messages, deals, and approvals. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SECURITY.md](docs/SECURITY.md).
