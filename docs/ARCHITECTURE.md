# Architecture

Community Bots is three small programs around one Postgres database (Supabase):

```
 Browser (apps/web)                Supabase (Postgres + Realtime)              Worker (apps/worker)
 ------------------                ------------------------------              --------------------
 inserts a job  ───────────────▶   jobs (queued)  ◀── polls every 2s, claims one ───┐
 (passcode from the organiser)                                                       │
                                                                                     ▼
 live updates   ◀── realtime ───   communities, runs, messages, deals,   ◀── writes ── runs the Bots
 (2s polling fallback)             approvals, announcements, rsvps            through a Backend
                                                                              (grokbot | openai | mock)
 approve link   ── rpc approve() ─▶ approvals → deals/runs status
 RSVP           ── insert ────────▶ rsvps
```

- The web app is static. It only **inserts jobs** and **RSVPs**, calls **`approve()`**, and **reads** tables.
- The worker holds the service role key. It is the only writer of communities, runs, messages, deals,
  approvals and announcements.
- `packages/core` is shared: zod schemas, evidence verification, deal validation, lenient JSON, prompt
  templates, the orchestrator and the backends.

## Packages

| Path | What it does |
|---|---|
| `packages/core/src/schemas.ts` | zod schemas and TypeScript types: Card, BotReply, MatchCandidate, Deal, job params, DB rows, `ExportedRun`. |
| `packages/core/src/card.ts` | `slugify`, `normaliseCard` (coerces loose model JSON into a valid Card; ids are derived in code), `normaliseDays`, `isGuess`. |
| `packages/core/src/evidence.ts` | `flattenCard`, `verifyEvidence`, `findEvidenceField`, `checkEvidence`, `getCardField`, `highlightQuote`. |
| `packages/core/src/json.ts` | `extractJson`: lenient JSON extraction (fences, prose, trailing commas). |
| `packages/core/src/dates.ts` | System-clock date helpers: `todayIso`, `dayOfWeek`, `allowedDaysForAll`, `nextAllowedDate`. |
| `packages/core/src/deal.ts` | `validateDeal`: zod plus code rules (future date, allowed weekday for every community, capacity, evidence). |
| `packages/core/src/ics.ts` | `buildIcs`: add-to-calendar file for a deal (floating local time). |
| `packages/core/src/prompts.ts` | Every prompt template (Scout, Community Bot standing rules, turn, Matchmaker, Scribe, announcement). |
| `packages/core/src/orchestrator.ts` | `draftCard`, `matchCommunities`, `runNegotiation` (chat protocol → Scribe → announcements). |
| `packages/core/src/backends/` | `Backend` interface and `createBackend(name, env)`: `grokbot.ts`, `openai.ts`, `mock.ts`. |
| `apps/worker` | Job loop, Supabase store, handlers, `seed` and `export-run` scripts. |
| `apps/web` | React + Vite + Tailwind + react-router + supabase-js. |
| `supabase/schema.sql` | Tables, RLS policies, `approve()`, realtime publication. |

`@community-bots/core` is consumed as TypeScript source (no build step). The browser imports only the
root entry (`@community-bots/core`); Node-only code is behind `@community-bots/core/backends` and
`@community-bots/core/orchestrator`.

## Data model

See `supabase/schema.sql`. Beyond the original spec, a few columns were added, each for one reason:

| Addition | Why |
|---|---|
| `communities.backend` | Cards drafted by the `mock` backend are sample data and must be labelled as such. |
| `jobs.type = 'confirm_card'` | anon cannot write `communities`; confirming an edited card goes through the worker (passcode checked). |
| `runs.match` | The verified match reasons for the chosen partners, so the run page can show the Match phase. |
| `runs.typing` | Community whose Bot is writing now, for the typing dots. |
| `runs.error` | Readable error when a run fails. |

### Jobs

The web app generates the job id (`crypto.randomUUID()`), inserts `{id, type, params, passcode}` without
asking for the row back (anon cannot read `passcode`), then watches that id via realtime with 2s polling.
Always select `JOB_PUBLIC_COLUMNS` from `jobs`.

| type | params | result | side effects |
|---|---|---|---|
| `draft_card` | `{url, name?}` | `{backend, card}` | upserts `communities` with status `draft` (never overwrites a `confirmed` card) |
| `confirm_card` | `{card}` | `{backend, card}` | upserts `communities` with status `confirmed` |
| `match` | `{leadId, need}` | `{backend, leadId, need, candidates}` | none |
| `negotiate` | `{runId?, leadId, need, partnerIds, matchJobId?}` | `{backend, runId, dealId, consensus}` | creates the run, messages, deal, announcements, approvals |

Status: `queued → running → done | error`. `progress` holds a short human-readable step
("browsing", "writing card", "Unicorn Mafia Bot is replying"). Errors are readable sentences.

The worker claims a job with a compare-and-set update
(`update jobs set status='running', passcode=null where id=$1 and status='queued'`), so two workers can
never run the same job. The passcode is checked against `WORKER_PASSCODE` after the claim; a mismatch
marks the job `error` with "Invalid passcode".

### Run lifecycle

```
negotiating ──▶ compiling ──▶ pending_approval ──▶ confirmed   (all approved, via approve())
     │              │                 └──────────▶ declined    (any declined)
     └──────────────┴──▶ error                     (stays pending_approval while changes are requested)
```

`deals.status` follows: `pending_approval | changes_requested | confirmed | declined`.
`approve()` recomputes both after every vote. A confirmed deal is final.

## Cards and evidence

A card holds only facts the Scout saw on public pages. Unknowns are `null` (or `[]`), inferences are
strings starting with `GUESS: `. `constraints.days` lists the weekdays a community can do; an empty list
means "not known", which is treated as no restriction.

`flattenCard(card)` joins every string value with newlines. `verifyEvidence(quote, card)` is true when the
quote, normalised (lower-case, collapsed whitespace, quote characters removed, surrounding punctuation
trimmed, at least 3 characters), is a substring of the normalised flattened card.

The worker stores `evidence: {quote, verified, field}` on messages, but **the browser always recomputes
`verified` itself** from the card it loads. A stored flag is never trusted.

## Orchestration

Each Bot only sees what the script sends it. All Bot replies are JSON, parsed with `extractJson`,
validated with zod, and retried up to 2 times with the error fed back.

1. `seq 0` is the organiser's need (role `human`).
2. Lead Bot restates the need and says what is needed.
3. Each partner Bot, in order, says what it can offer and what it wants in return.
4. Lead Bot proposes a concrete split: date, venue, who brings what.
5. Each partner answers: `accept`, `counter`, `decline` or `question`.
6. If anyone did not accept, the lead revises once and partners (except those who declined) answer once more.
7. Stop when all accept, or at 12 Bot messages. `consensus` is true only if every partner's final stance is `accept`.

Every message is inserted as it arrives, with `delay_ms = min(4000, 700 + 25 * chars)` for replay pacing.
Then the Scribe compiles the deal (validated by `validateDeal`, retried up to 3 times with the errors fed
back), each community's Bot writes an announcement (max 50 words, from the deal only), approvals with
tokens are created, and the run moves to `pending_approval`.

Turn prompts carry the need, the participants (id, name, card status, allowed days, max group size), the
transcript so far as `Speaker: text` lines, today's date from the system clock, and the turn's instruction.

## Backends

```ts
interface Backend { name: "grokbot" | "openai" | "mock"; canBrowse: boolean; ask({ bot, standingRules?, prompt }): Promise<string> }
```

- **grokbot** shells out to the Grok Bot skill CLI (`python3 $GROKBOT_SKILL_PATH ...`). `ensureBot()`
  runs `list`, then `create --name cb-<id> --title ... --description <standing rules>` if missing, or
  `update --name ... --description ...` when the rules (which embed the card) changed. Turns use
  `chat --name <bot> --prompt <prompt> --timeout <TURN_TIMEOUT_MS/1000>` and read the reply from
  `newEntries`. A turn that fails or times out is retried once, then fails with a clear error.
  The Scout browses the web itself (`canBrowse: true`).
- **openai** calls `POST {LLM_BASE_URL}/chat/completions` with the standing rules as the system message.
  It cannot browse, so the worker fetches the public page(s) and passes their text to the Scout as data.
- **mock** is deterministic and offline. It reads the data blocks in each prompt and returns scripted JSON
  that follows the protocol. Runs and cards it produces are stamped `backend: "mock"` and the UI shows
  "Sample data, not a real Bot run".

Bot names: `cb-<communityId>`, `cb-scout`, `cb-matchmaker`, `cb-scribe`.

## Web routes

| Route | Purpose |
|---|---|
| `/` | Directory grid with "confirmed" / "draft from public info" / "sample data" badges |
| `/add` | URL → live job progress → card editor (GUESS highlighted) → Confirm |
| `/c/:id` | Community profile and "Start a collab request" |
| `/c/:id/request` | Need → match → pick up to 3 → start negotiation |
| `/run/:runId` | Phase tracker, live group chat with evidence chips, deal, approvals with QR links |
| `/approve/:token` | Phone view: deal summary, that community's evidence, approve / decline / request change |
| `/event/:dealId` | Public event page: Draft → Confirmed, RSVP, .ics, QR, announcements |
| `/replay/:runId`, `/demo` | Replay a saved run (DB or `public/demo-run.json`) with pause, skip, 1x/2x/4x |
| `/how-it-works` | Pipeline, backend per run, verified-evidence count, run it yourself |

`?present=1` switches to projector mode (large type, QR codes). Live data uses Supabase realtime with a
2s polling fallback. If Supabase env vars are missing, `/demo` and `/how-it-works` still work.

## Replay file

`npm run export-run -- --run <id>` writes `apps/web/public/demo-run.json` (`ExportedRun` in
`schemas.ts`): the run, the cards involved, messages, deal, approvals **without tokens**, and
announcements. `/demo` loads it so the deployed site works without the worker or Supabase.
