import { GUESS_PREFIX } from "@community-bots/core";
import type { Community } from "../data/types";

export type WallCategory = "space" | "speakers" | "audience" | "sponsorship";
export type WallFilter = WallCategory | "all";

export const WALL_FILTERS: { id: WallFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "space", label: "Space" },
  { id: "speakers", label: "Speakers" },
  { id: "audience", label: "Audience" },
  { id: "sponsorship", label: "Sponsorship" },
];

const PATTERNS: Record<WallCategory, RegExp> = {
  space: /\b(space|spaces|venue|venues|room|rooms|hall|auditorium|theatre|theater|rooftop|office|studio|premises|yard|warehouse|loft|basement|desks?)\b/i,
  speakers: /\b(speakers?|talks?|mentors?|mentoring|coach(es|ing)?|experts?|panel(lists?)?|judges?|facilitators?|trainers?|teach(ing)?|demos?)\b/i,
  audience: /\b(audience|members|attendees|newsletter|mailing list|followers|subscribers|students|promot(e|ion|ing)|reach|sign-?ups?|participants|community of)\b/i,
  sponsorship: /\b(sponsors?|sponsorship|funding|budget|grants?|prizes?|food|pizza|drinks|catering|swag|credits|bursar(y|ies))\b/i,
};

/** Categories a piece of card text belongs to, in filter order. */
export function categorize(text: string): WallCategory[] {
  return (Object.keys(PATTERNS) as WallCategory[]).filter((c) => PATTERNS[c].test(text));
}

export interface WallPost {
  id: string;
  communityId: string;
  communityName: string;
  status: Community["status"];
  kind: "offer" | "need";
  /** Display text without the GUESS prefix. */
  text: string;
  /** The exact card text, used as the evidence quote. */
  quote: string;
  field: string;
  guess: boolean;
  categories: WallCategory[];
}

const stripGuess = (s: string) => (s.startsWith(GUESS_PREFIX) ? s.slice(GUESS_PREFIX.length) : s);

/**
 * Offers and needs from every card, as short posts by that community's Bot.
 * Interleaved round-robin so one community never fills the wall.
 */
export function buildWallPosts(communities: Community[]): WallPost[] {
  const perCommunity = communities.map((c) => {
    const posts: WallPost[] = [];
    const add = (kind: "offer" | "need", value: string, index: number) => {
      const field = `${kind === "offer" ? "offers" : "needs"}[${index}]`;
      posts.push({
        id: `${c.id}:${field}`,
        communityId: c.id,
        communityName: c.name,
        status: c.status,
        kind,
        text: stripGuess(value),
        quote: stripGuess(value),
        field,
        guess: value.startsWith(GUESS_PREFIX),
        categories: categorize(value),
      });
    };
    const max = Math.max(c.card.offers.length, c.card.needs.length);
    for (let i = 0; i < max; i++) {
      if (c.card.offers[i]) add("offer", c.card.offers[i], i);
      if (c.card.needs[i]) add("need", c.card.needs[i], i);
    }
    return posts;
  });
  const out: WallPost[] = [];
  const longest = Math.max(0, ...perCommunity.map((p) => p.length));
  for (let i = 0; i < longest; i++) {
    for (const posts of perCommunity) if (posts[i]) out.push(posts[i]);
  }
  return out;
}

export function filterWall(posts: WallPost[], filter: WallFilter, query = ""): WallPost[] {
  const q = query.trim().toLowerCase();
  return posts.filter(
    (p) =>
      (filter === "all" || p.categories.includes(filter)) &&
      (!q || p.text.toLowerCase().includes(q) || p.communityName.toLowerCase().includes(q)),
  );
}

/** Prefilled need for "Start a collab from this". */
export function needFromPost(post: WallPost): string {
  return post.kind === "need" ? post.text : `Looking for partners to use this: ${post.text}`;
}
