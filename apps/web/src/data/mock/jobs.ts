/**
 * Mock versions of the worker's draft_card and match jobs. Generic: they work from whatever
 * URL or cards they are given. Everything they produce is labelled sample data in the UI.
 */
import {
  allowedDaysForAll,
  GUESS_PREFIX,
  slugify,
  type Card,
  type Fit,
  type MatchCandidate,
} from "@community-bots/core";
import { categorize, type WallCategory } from "../../lib/wall";
import type { Community } from "../types";
import { requestedCapacity, stripGuess } from "./engine";

const CATEGORY_LABEL: Record<WallCategory, string> = {
  space: "a space",
  speakers: "speakers",
  audience: "an audience",
  sponsorship: "sponsorship",
};

/** Ranks every other community for a need. Reasons quote the candidate's own card. */
export function rankMatches(lead: Community, need: string, all: Community[]): MatchCandidate[] {
  const wanted = categorize(need);
  const fallback = wanted.length ? wanted : lead.card.needs.flatMap((n) => categorize(n));
  const leadOfferCats = new Set(lead.card.offers.flatMap((o) => categorize(o)));
  const size = requestedCapacity(need);

  const scored = all
    .filter((c) => c.id !== lead.id)
    .map((c) => {
      let score = 0;
      const reasons: MatchCandidate["reasons"] = [];
      const concerns: string[] = [];
      const used = new Set<string>();
      for (const category of fallback) {
        const offer = c.card.offers.find((o) => categorize(o).includes(category) && !used.has(o));
        if (offer) {
          used.add(offer);
          score += 2;
          reasons.push({ claim: `Offers ${CATEGORY_LABEL[category]}`, evidence: stripGuess(offer), cardOwnerId: c.id });
        }
      }
      const want = c.card.needs.find((n) => categorize(n).some((cat) => leadOfferCats.has(cat)));
      if (want) {
        score += 1;
        reasons.push({ claim: `Wants what ${lead.name} offers`, evidence: stripGuess(want), cardOwnerId: c.id });
      }
      const leadDays = lead.card.constraints.days;
      const theirDays = c.card.constraints.days;
      if (allowedDaysForAll([leadDays, theirDays]).length === 0) {
        score -= 3;
        concerns.push(`No shared day: ${lead.name} does ${leadDays.join(", ")}, they do ${theirDays.join(", ")}`);
      }
      const max = c.card.constraints.maxGroupSize;
      if (size !== null && max !== null && max < size) {
        score -= 1;
        concerns.push(`Their max group is ${max}, below the ${size} you asked for`);
      }
      if (c.status === "draft") concerns.push("Card is a draft from public info, not confirmed by them");
      if (reasons.length === 0 && c.card.offers[0]) {
        reasons.push({ claim: "Could help", evidence: stripGuess(c.card.offers[0]), cardOwnerId: c.id });
      }
      const fit: Fit = score >= 3 ? "strong" : score >= 1 ? "good" : "weak";
      return { candidate: { communityId: c.id, fit, reasons: reasons.slice(0, 3), concerns }, score, name: c.name };
    });

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((s) => s.candidate);
}

const ACRONYMS = new Set(["ai", "ml", "ux", "ui", "uk", "us", "eu", "vr", "xr", "ar", "dao", "ngo", "nyc", "sf", "hq", "js", "ios", "api", "lgbtq", "stem", "diy", "it"]);
const SKIP_SEGMENTS = new Set(["company", "companies", "groups", "group", "g", "c", "in", "events", "event", "about", "pages", "page", "school", "org", "u", "r", "invite", "join", "home", "en", "www"]);

function titleCase(slug: string): string {
  return slug
    .split(/[-_.+\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Best-effort community name from a URL: the last meaningful path segment, else the domain. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter((s) => s && !SKIP_SEGMENTS.has(s.toLowerCase()) && !/^\d+$/.test(s));
    const host = u.hostname.replace(/^www\./, "");
    const isPlatform = /(linkedin|meetup|lu\.ma|luma|discord|eventbrite|facebook|instagram|x\.com|twitter|github|slack|substack|medium)/.test(host);
    const raw = isPlatform && segments.length ? segments[segments.length - 1] : host.split(".")[0];
    const name = titleCase(decodeURIComponent(raw));
    return name.length >= 2 ? name : "New Community";
  } catch {
    return "New Community";
  }
}

const g = (s: string) => `${GUESS_PREFIX}${s}`;

/**
 * A sample draft card for a URL. The mock cannot browse, so every inferred field is marked
 * "GUESS: " for the organiser to check, and unknowns stay null or empty.
 */
export function draftCardFromUrl(url: string, nameHint?: string): Card {
  const name = nameHint?.trim() || nameFromUrl(url);
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* validated before this is called */
  }
  const audience = /discord|slack/.test(host)
    ? "An active online community that turns up to events"
    : /meetup|lu\.ma|luma|eventbrite/.test(host)
      ? "An audience of members who come to regular meetups"
      : /linkedin/.test(host)
        ? "An audience of professionals who follow our updates"
        : "An audience of members who come to regular events";
  return {
    id: slugify(name),
    name,
    tagline: g(`${name} brings people together around shared interests`),
    location: null,
    members: g("A few hundred members"),
    runs: [{ event: g("Monthly meetup"), frequency: g("Monthly") }],
    offers: [g(audience), g("Volunteers who can help run a joint event"), g("Promotion to our members through our newsletter")],
    needs: [g("A venue for 30 to 60 people"), g("Speakers for upcoming events")],
    constraints: { days: [], maxGroupSize: null, notes: g("Weekday evenings are likely best") },
    tone: g("Friendly and informal"),
    sourceUrls: [url],
  };
}
