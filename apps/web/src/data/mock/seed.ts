/**
 * Sample data for the mock backend. Every community here is invented and every URL is on
 * example.org. The UI labels all of it "Sample data, not a real Bot run".
 */
import type { Card } from "@community-bots/core";
import { hashString } from "../../lib/color";

/** A uuid-shaped id derived from a string, so sample links stay stable across resets. */
export function stableUuid(seed: string): string {
  const hex = [0, 1, 2, 3].map((i) => hashString(`${seed}:${i}`).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface SeedCommunity {
  status: "draft" | "confirmed";
  card: Card;
}

const url = (id: string) => [`https://example.org/${id}`];

export const SEED_COMMUNITIES: SeedCommunity[] = [
  {
    status: "confirmed",
    card: {
      id: "canal-street-coders",
      name: "Canal Street Coders",
      tagline: "Free beginner coding nights, run by volunteers",
      location: "Manchester city centre",
      members: "About 900 learners and volunteer coaches",
      runs: [
        { event: "Beginner coding night", frequency: "Every Wednesday" },
        { event: "Weekend project sprint", frequency: "Monthly, on Saturdays" },
      ],
      offers: ["Volunteer coaches for beginner coding workshops", "A mailing list of 2,400 learners", "Laptops to lend for workshops"],
      needs: ["A venue for weekend workshops of 40 people", "Speakers who work in industry", "Sponsorship for food at events"],
      constraints: { days: ["Wed", "Sat"], maxGroupSize: 60, notes: "Wednesday evenings and Saturday daytime only" },
      tone: "Warm, plain-spoken, beginner-friendly",
      sourceUrls: url("canal-street-coders"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "riverside-makers",
      name: "Riverside Makers",
      tagline: "A community workshop with tools, benches and a big room",
      location: "Salford Quays",
      members: "320 makers, from hobbyists to hardware founders",
      runs: [{ event: "Open workshop", frequency: "Tuesdays, Thursdays and Saturdays" }],
      offers: ["Workshop space for up to 50 people", "Laser cutter and 3D printers", "Volunteers who host weekend sessions"],
      needs: ["Speakers on product design", "An audience for our maker showcase"],
      constraints: { days: ["Tue", "Thu", "Sat"], maxGroupSize: 50, notes: "Our main room fits 50 people; we open Tue, Thu and Sat" },
      tone: "Hands-on and friendly",
      sourceUrls: url("riverside-makers"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "open-data-collective",
      name: "Open Data Collective",
      tagline: "Civic technologists making public data useful",
      location: "Ancoats, Manchester",
      members: "1,100 people on the mailing list",
      runs: [
        { event: "Civic hack day", frequency: "Quarterly" },
        { event: "Data talks", frequency: "Monthly" },
      ],
      offers: ["A meeting room for 45 people at our co-working space", "Speakers on open data and public policy", "Promotion to our 1,100 subscribers"],
      needs: ["Developers for weekend hack days", "Volunteers to run beginner sessions"],
      constraints: { days: ["Wed", "Thu", "Sat"], maxGroupSize: 45, notes: "The room holds 45 people. Talks on weekday evenings, hack days on Saturdays" },
      tone: "Thoughtful and practical",
      sourceUrls: url("open-data-collective"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "northside-founders-circle",
      name: "Northside Founders Circle",
      tagline: "Early-stage founders helping each other",
      location: "Manchester",
      members: "About 150 founders",
      runs: [{ event: "Founder dinner", frequency: "Monthly" }],
      offers: ["Founders who mentor first-time builders", "Sponsorship for food from member startups", "A demo-night format that works"],
      needs: ["A bigger venue for demo nights", "An audience of technical talent"],
      constraints: { days: ["Tue", "Wed", "Thu"], maxGroupSize: 80, notes: "Weekday evenings; dinners are capped at 80" },
      tone: "Direct and generous",
      sourceUrls: url("northside-founders-circle"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "design-systems-club",
      name: "Design Systems Club",
      tagline: "Designers and engineers who build component libraries",
      location: "Manchester and online",
      members: "600 members on Slack",
      runs: [{ event: "Show and tell", frequency: "Monthly" }],
      offers: ["Speakers on design systems and accessibility", "Workshop leads for Figma and front-end sessions"],
      needs: ["A venue with a projector", "Co-hosts who can reach developers"],
      constraints: { days: ["Mon", "Tue", "Thu"], maxGroupSize: 70, notes: "Monday, Tuesday or Thursday evenings" },
      tone: "Precise and welcoming",
      sourceUrls: url("design-systems-club"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "climate-tech-north",
      name: "Climate Tech North",
      tagline: "People working on climate solutions in the north",
      location: "Liverpool",
      members: "450 members",
      runs: [{ event: "Climate drinks", frequency: "Monthly" }],
      offers: ["Speakers from climate startups", "A sponsor network of local climate funds", "Promotion through our newsletter of 3,000 readers"],
      needs: ["Engineers for climate hack days", "A venue for 100 people"],
      constraints: { days: ["Thu", "Fri"], maxGroupSize: 100, notes: "Thursday and Friday evenings" },
      tone: "Optimistic and evidence-led",
      sourceUrls: url("climate-tech-north"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "indie-game-night",
      name: "Indie Game Night",
      tagline: "Play, test and talk about indie games",
      location: "Northern Quarter, Manchester",
      members: "250 regulars",
      runs: [{ event: "Playtest night", frequency: "Fortnightly" }],
      offers: ["A playtesting audience of 250 regulars", "Game developers who give short talks"],
      needs: ["A venue with screens", "Sponsorship for prizes"],
      constraints: { days: ["Fri", "Sat"], maxGroupSize: 60, notes: "Friday nights and Saturday afternoons" },
      tone: "Playful and relaxed",
      sourceUrls: url("indie-game-night"),
    },
  },
  {
    status: "confirmed",
    card: {
      id: "northern-data-guild",
      name: "Northern Data Guild",
      tagline: "Analysts and data scientists who share their work",
      location: "Manchester",
      members: "700 members",
      runs: [{ event: "Data show and tell", frequency: "Monthly" }],
      offers: ["Mentors for career changers", "Speakers on analytics and machine learning"],
      needs: ["Beginner-friendly events to mentor at", "A venue for 60 people"],
      constraints: { days: ["Tue", "Wed"], maxGroupSize: 60, notes: "Tuesday and Wednesday evenings" },
      tone: "Curious and supportive",
      sourceUrls: url("northern-data-guild"),
    },
  },
  {
    status: "draft",
    card: {
      id: "student-robotics-society",
      name: "Student Robotics Society",
      tagline: "University students building robots",
      location: "Oxford Road campus",
      members: "GUESS: Around 200 students",
      runs: [{ event: "Build night", frequency: "GUESS: Weekly in term time" }],
      offers: ["A university lecture theatre for 150 people", "Student volunteers"],
      needs: ["Industry speakers", "Sponsorship for competition kits"],
      constraints: { days: ["Mon", "Wed", "Fri"], maxGroupSize: 150, notes: "GUESS: Term time only, Monday, Wednesday and Friday evenings" },
      tone: "GUESS: Enthusiastic",
      sourceUrls: url("student-robotics-society"),
    },
  },
  {
    status: "draft",
    card: {
      id: "bike-kitchen-collective",
      name: "Bike Kitchen Collective",
      tagline: "Community bike repair and riding",
      location: "Hulme",
      members: "GUESS: About 120 volunteers",
      runs: [{ event: "Fix-your-bike session", frequency: "Weekends" }],
      offers: ["A workshop yard for outdoor events of 30 people", "Volunteers who teach bike repair"],
      needs: ["An audience of new cyclists", "Sponsorship for spare parts"],
      constraints: { days: ["Sat", "Sun"], maxGroupSize: 30, notes: "Weekends only, outdoors" },
      tone: "GUESS: Easy-going",
      sourceUrls: url("bike-kitchen-collective"),
    },
  },
  {
    status: "draft",
    card: {
      id: "morning-pitch-club",
      name: "Morning Pitch Club",
      tagline: "Founders practise pitching over breakfast",
      location: "Spinningfields",
      members: "GUESS: 90 founders and angels",
      runs: [{ event: "Pitch breakfast", frequency: "GUESS: Fortnightly" }],
      offers: ["Pitch feedback from angel investors", "Sponsorship from member funds for breakfasts"],
      needs: ["An early-morning venue for 40", "Founders who are fundraising"],
      constraints: { days: ["Tue", "Fri"], maxGroupSize: 40, notes: "Breakfast sessions from 8am" },
      tone: "GUESS: Brisk and encouraging",
      sourceUrls: url("morning-pitch-club"),
    },
  },
  {
    status: "draft",
    card: {
      id: "tandem-language-cafe",
      name: "Tandem Language Café",
      tagline: "Practise languages over coffee",
      location: "Chorlton",
      members: "400 members across 12 languages",
      runs: [{ event: "Language café", frequency: "Weekly" }],
      offers: ["A friendly audience of 400 multilingual members", "Volunteer hosts for small-group tables"],
      needs: ["A café-style venue for 60 people", "Sponsorship for coffee"],
      constraints: { days: ["Thu", "Sun"], maxGroupSize: 60, notes: "GUESS: Thursday evenings and Sunday afternoons" },
      tone: "Warm and chatty",
      sourceUrls: url("tandem-language-cafe"),
    },
  },
];

export type SeedStep =
  | { type: "negotiate" }
  | { type: "respond"; communityId: string; decision: "approved" | "declined" | "renegotiate"; note?: string; afterMs: number }
  | { type: "nextRound"; afterMs: number }
  | { type: "rsvps"; count: number };

export interface SeedRun {
  key: string;
  leadId: string;
  partnerIds: string[];
  need: string;
  /** How long ago the run started. */
  ageMs: number;
  /** "live" runs keep negotiating in real time after seeding. */
  live: boolean;
  script: SeedStep[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The organiser the sample world treats as "you" until you add your own community. */
export const SAMPLE_VIEWER_ID = "northern-data-guild";

export const SEED_RUNS: SeedRun[] = [
  {
    // Negotiating live. One partner's days do not overlap, so its Bot declines; another counters on size.
    key: "live",
    leadId: "northside-founders-circle",
    partnerIds: ["riverside-makers", "design-systems-club", "bike-kitchen-collective"],
    need: "A demo night for 60 people next month. We need a bigger venue and a couple of speakers.",
    ageMs: 3000,
    live: true,
    script: [],
  },
  {
    // Round 2, waiting on you: the deal changed after a partner asked to renegotiate.
    key: "round-two",
    leadId: "canal-street-coders",
    partnerIds: ["open-data-collective", SAMPLE_VIEWER_ID],
    need: "A beginner data workshop for 40 people. We need a space and a few mentors.",
    ageMs: 3 * HOUR,
    live: false,
    script: [
      { type: "negotiate" },
      { type: "respond", communityId: "canal-street-coders", decision: "approved", afterMs: 6 * MIN },
      {
        type: "respond",
        communityId: "open-data-collective",
        decision: "renegotiate",
        note: "Can we start an hour earlier and keep it to 30 people? Our room gets tight.",
        afterMs: 9 * MIN,
      },
      { type: "nextRound", afterMs: 1 * MIN },
      { type: "negotiate" },
      { type: "respond", communityId: "canal-street-coders", decision: "approved", afterMs: 7 * MIN },
      { type: "respond", communityId: "open-data-collective", decision: "approved", afterMs: 4 * MIN },
    ],
  },
  {
    key: "confirmed",
    leadId: "climate-tech-north",
    partnerIds: ["student-robotics-society", "indie-game-night"],
    need: "A climate game jam for 60 people on a Friday evening. We need a big room and an audience.",
    ageMs: 3 * 24 * HOUR,
    live: false,
    script: [
      { type: "negotiate" },
      { type: "respond", communityId: "student-robotics-society", decision: "approved", afterMs: 20 * MIN },
      { type: "respond", communityId: "indie-game-night", decision: "approved", afterMs: 45 * MIN },
      { type: "respond", communityId: "climate-tech-north", decision: "approved", afterMs: 10 * MIN },
      { type: "rsvps", count: 23 },
    ],
  },
  {
    key: "declined",
    leadId: "indie-game-night",
    partnerIds: ["riverside-makers", "northern-data-guild"],
    need: "A Saturday playtest party for 50 people. We need a space.",
    ageMs: 26 * HOUR,
    live: false,
    script: [
      { type: "negotiate" },
      { type: "respond", communityId: "indie-game-night", decision: "approved", afterMs: 15 * MIN },
      {
        type: "respond",
        communityId: "riverside-makers",
        decision: "declined",
        note: "That Saturday clashes with our open workshop, sorry. Try us in the new year.",
        afterMs: 40 * MIN,
      },
    ],
  },
];
