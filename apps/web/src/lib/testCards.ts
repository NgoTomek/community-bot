import type { Card, Deal } from "@community-bots/core";

/** Made-up cards for unit tests. */
export function testCard(overrides: Partial<Card> & { id: string; name: string }): Card {
  return {
    tagline: null,
    location: null,
    members: null,
    runs: [],
    offers: [],
    needs: [],
    constraints: { days: [], maxGroupSize: null, notes: null },
    tone: null,
    sourceUrls: [],
    ...overrides,
  };
}

export const alpha = testCard({
  id: "alpha-guild",
  name: "Alpha Guild",
  offers: ["A loft space for 40 people", "Volunteer hosts"],
  needs: ["Speakers on robotics"],
  constraints: { days: ["Tue", "Thu"], maxGroupSize: 40, notes: "Our loft fits 40 people" },
});

export const beta = testCard({
  id: "beta-circle",
  name: "Beta Circle",
  offers: ["Speakers on robotics and AI", "GUESS: A newsletter with 900 readers"],
  needs: ["A venue for 60 people"],
  constraints: { days: [], maxGroupSize: null, notes: null },
});

export function testDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    title: "Robotics night: Alpha Guild × Beta Circle",
    date: "2026-11-19",
    time: "18:30",
    venue: "Alpha Guild loft",
    capacity: 40,
    description: "Alpha Guild and Beta Circle team up for a robotics night.",
    communities: [
      { id: "alpha-guild", name: "Alpha Guild", role: "host", brings: ["A loft space for 40 people"] },
      { id: "beta-circle", name: "Beta Circle", role: "speaker", brings: ["Speakers on robotics and AI"] },
    ],
    agenda: [
      { time: "18:30", item: "Doors open" },
      { time: "19:00", item: "Talks" },
    ],
    reasons: [],
    consensus: true,
    status: "pending_approval",
    ...overrides,
  };
}
