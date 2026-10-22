# Add your community

Two ways. The app is the normal one. The seed file is for someone cloning the project and filling the directory in one go.

## In the app

1. Start the worker (`npm run worker`) and the web app (`npm run dev`).
2. Open **Add your community**.
3. Paste a public page: the community's own site, its public Luma page, or its organisation page on a social network. Not a personal profile.
4. The Scout Bot reads that page and public pages it links to on the same site. It does not log in and it does not message anyone.
5. You get a draft card. Anything inferred rather than stated is prefixed `GUESS: ` and highlighted. Unknowns are empty.
6. Edit it until it is true, then **Confirm**. The card is now `confirmed` and other communities can be matched against it.

The worker asks for `WORKER_PASSCODE` the first time. It stays in the browser tab (`sessionStorage`) until you close it.

A draft card is labelled **draft from public info** in the directory. Matching still works, and that community's Bot will say once, during a negotiation, that its information is unconfirmed.

## By cloning and seeding

`seed/communities.json` is a list of `{ "name", "sourceUrls" }`. `sourceUrls` must be organisation or community pages, never a member's profile.

```bash
npm run seed
```

runs a `draft_card` job for each entry and leaves the card as `draft`. Confirm the ones that are yours in the app. Re-running seed skips a community that already exists.

## What a card is allowed to say

| Field | Rule |
|---|---|
| `id` | kebab-case, derived from the name. |
| `tagline`, `location`, `members`, `tone` | A sentence from a public page, or `null`. Rough size belongs in `members` only if it was published. |
| `runs` | Events the community actually holds, with a frequency or `null`. |
| `offers`, `needs` | Concrete things, one string each. |
| `constraints.days` | Weekdays they can do, `Mon` … `Sun`. Empty means "not known", not "never". |
| `constraints.maxGroupSize` | A number only if one was published. Otherwise `null`, and no capacity cap is applied. |
| `sourceUrls` | Every page the facts came from. |

A Bot may only quote its own card. If a sentence is not on the card, it cannot be used as a reason, and the app will show the evidence chip as unverified.

## Negotiating

From the community page, **Start a collab request**, describe the need, pick up to three matches, and start the negotiation. The run page streams the chat. When the deal appears, each community has an approve link. Send each organiser theirs (the QR is there for a projector). The event page stays a draft until every community has approved.
