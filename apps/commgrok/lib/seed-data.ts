// Single source of truth for demo data, used by the local store.
// supabase/seed.sql mirrors it for Supabase mode. All names are fictional.
// Dates are relative to "today" (Europe/London) so the seed never goes stale.

export const SEED_TEAMS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Builders Collective", role: "Host community", avatar_url: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "Canal Works", role: "Venue & co-host", avatar_url: null },
];

/** Demo logins (password "demo1234"). Plaintext only here; hashed when seeding. Mirrored in supabase/seed.sql. */
export const SEED_USERS = [
  { id: "a0000000-0000-4000-8000-000000000001", email: "tom@commgrok.demo", name: "Tom Adeyemi", team_id: SEED_TEAMS[0].id, password: "demo1234" },
  { id: "a0000000-0000-4000-8000-000000000002", email: "maya@commgrok.demo", name: "Maya Brooks", team_id: SEED_TEAMS[1].id, password: "demo1234" },
];

const BUILDERS = SEED_TEAMS[0].id;
const CANAL = SEED_TEAMS[1].id;

export const SEED_PEOPLE = [
  "Alex Morgan", "Bea Kowalski", "Chidi Obi", "Dana Levi", "Eitan Shah", "Farah Khan", "Gus Lindqvist",
  "Hana Sato", "Iris Doyle", "Jamal Reid", "Kiran Patel", "Lena Fischer", "Mo Haddad", "Nina Rossi",
  "Oli Grant", "Pia Jensen", "Quinn Avery", "Rhea Kapoor", "Sam Ellis", "Tara Byrne",
];

export interface SeedEvent {
  id: string;
  slug: string;
  title: string;
  event_type: "meetup" | "talk" | "workshop" | "social" | "hackathon" | "other";
  communities: string[];
  description_md: string;
  day_offset: number;
  /** Optional: move forward from day_offset to the next date on this weekday (0 = Sunday ... 6 = Saturday). */
  weekday?: number;
  start_time: string;
  end_time: string;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  cover_url: string | null;
  capacity: number | null;
  price_label: string;
  hosts: { name: string; avatar_url: string | null }[];
  status: "proposed" | "renegotiating" | "rejected" | "published" | "cancelled";
  source: "bot" | "manual";
  created_days_ago: number;
  approvals: { team_id: string; approver_name: string; decision: "approved" | "rejected" | "renegotiate"; note: string | null }[];
  going: number;
  waitlist: number;
}

export const SEED_EVENTS: SeedEvent[] = [
  {
    id: "e0000000-0000-4000-8000-000000000001",
    slug: "prompt-engineering-clinic",
    title: "Prompt Engineering Clinic",
    event_type: "workshop",
    communities: ["Builders Collective", "Women Who Ship"],
    description_md:
      "Bring a prompt that isn't working. We'll fix it together, live, on the big screen.\n\n" +
      "**What to bring**\n\n- A laptop\n- One real prompt from your project (anything you're happy to share)\n- Questions about evals, structured output or tool use\n\n" +
      "Mentors from three London AI teams will rotate between tables. Beginners very welcome.",
    day_offset: 7,
    start_time: "18:30",
    end_time: "20:30",
    venue_name: "Canal Works",
    venue_address: "12 Wharf Road, London N1 7GR",
    online_url: null,
    cover_url: "/covers/prompt-clinic.svg",
    capacity: 30,
    price_label: "Free",
    hosts: [{ name: "Priya Nair", avatar_url: null }, { name: "Sofia Marin", avatar_url: null }],
    status: "proposed",
    source: "bot",
    created_days_ago: 0,
    approvals: [],
    going: 0,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000002",
    slug: "canal-run-and-coffee",
    title: "Canal Run + Coffee",
    event_type: "social",
    communities: ["Indie Hackers LDN"],
    description_md:
      "An easy 5k along Regent's Canal at conversation pace, then coffee and pastries at the venue.\n\n" +
      "No one gets left behind: we split into two pace groups. Bag drop available.",
    day_offset: 10,
    start_time: "09:30",
    end_time: "11:00",
    venue_name: "Granary Square steps",
    venue_address: "Granary Square, London N1C 4AA",
    online_url: null,
    cover_url: "/covers/canal-run.svg",
    capacity: null,
    price_label: "Free",
    hosts: [{ name: "Leo Chen", avatar_url: null }],
    status: "proposed",
    source: "bot",
    created_days_ago: 1,
    approvals: [],
    going: 0,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000003",
    slug: "open-source-sprint",
    title: "Open Source Sprint: Ship Your First PR",
    event_type: "hackathon",
    communities: ["Open Source London", "Builders Collective"],
    description_md:
      "A one-day sprint for people who've always meant to contribute to open source.\n\n" +
      "Maintainers from five projects bring hand-picked *good first issues*. You pair up, ship a pull request, and we ring a bell for every merge.\n\n" +
      "Lunch is on the venue. Bring a laptop with git set up.",
    day_offset: 16,
    start_time: "10:00",
    end_time: "17:00",
    venue_name: "Canal Works",
    venue_address: "12 Wharf Road, London N1 7GR",
    online_url: null,
    cover_url: "/covers/oss-sprint.svg",
    capacity: 40,
    price_label: "Free",
    hosts: [{ name: "Jonah Pike", avatar_url: null }, { name: "Amara Okafor", avatar_url: null }],
    status: "proposed",
    source: "manual",
    created_days_ago: 2,
    approvals: [{ team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "approved", note: null }],
    going: 0,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000004",
    slug: "london-ai-builders-14",
    title: "London AI Builders Meetup #14",
    event_type: "meetup",
    communities: ["London AI Builders", "Builders Collective"],
    description_md:
      "Our monthly meetup for people building with AI in London.\n\n" +
      "**Running order**\n\n1. 18:30 Doors, pizza and intros\n2. 19:00 Three 10-minute demos from the community\n3. 19:45 Open floor: what are you stuck on?\n4. 20:15 Drinks by the canal\n\n" +
      "Want to demo? Reply in the community chat and the bot will add you to the list.",
    day_offset: 5,
    start_time: "18:30",
    end_time: "21:00",
    venue_name: "Canal Works",
    venue_address: "12 Wharf Road, London N1 7GR",
    online_url: null,
    cover_url: "/covers/ai-builders.svg",
    capacity: 120,
    price_label: "Free",
    hosts: [{ name: "Tom Adeyemi", avatar_url: null }, { name: "Priya Nair", avatar_url: null }],
    status: "published",
    source: "bot",
    created_days_ago: 6,
    approvals: [
      { team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "approved", note: null },
      { team_id: CANAL, approver_name: "Maya Brooks", decision: "approved", note: null },
    ],
    going: 9,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000005",
    slug: "agents-in-production-lightning-talks",
    title: "Lightning Talks: Agents in Production",
    event_type: "talk",
    communities: ["London AI Builders", "Women Who Ship"],
    description_md:
      "Six five-minute talks from people running AI agents in production. What broke, what it cost and what they'd do differently.\n\n" +
      "Small room, so places are limited. If it's full, join the waitlist and we'll let you know if a spot opens up.",
    day_offset: 6,
    start_time: "18:00",
    end_time: "20:00",
    venue_name: "Lantern Hall",
    venue_address: "41 Pentonville Road, London N1 9HF",
    online_url: null,
    cover_url: "/covers/lightning-talks.svg",
    capacity: 10,
    price_label: "Free",
    hosts: [{ name: "Sofia Marin", avatar_url: null }],
    status: "published",
    source: "manual",
    created_days_ago: 8,
    approvals: [
      { team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "approved", note: null },
      { team_id: CANAL, approver_name: "Maya Brooks", decision: "approved", note: null },
    ],
    going: 10,
    waitlist: 2,
  },
  {
    id: "e0000000-0000-4000-8000-000000000006",
    slug: "women-who-ship-breakfast",
    title: "Women Who Ship: Breakfast Club",
    event_type: "social",
    communities: ["Women Who Ship"],
    description_md:
      "Coffee, pastries and honest conversation about shipping products. Everyone who identifies as a woman or non-binary is welcome.",
    day_offset: -6,
    start_time: "08:00",
    end_time: "09:30",
    venue_name: "Pollen Café",
    venue_address: "3 Exmouth Market, London EC1R 4QL",
    online_url: null,
    cover_url: "/covers/breakfast-club.svg",
    capacity: 25,
    price_label: "Free",
    hosts: [{ name: "Amara Okafor", avatar_url: null }, { name: "Sofia Marin", avatar_url: null }],
    status: "published",
    source: "bot",
    created_days_ago: 14,
    approvals: [
      { team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "approved", note: null },
      { team_id: CANAL, approver_name: "Maya Brooks", decision: "approved", note: null },
    ],
    going: 14,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000007",
    slug: "rust-for-ai-engineers",
    title: "Rust for AI Engineers: Hands-on Evening",
    event_type: "workshop",
    communities: ["Builders Collective", "Rust London"],
    description_md:
      "A hands-on evening for AI engineers curious about Rust.\n\n" +
      "- Write a tiny inference server in Rust\n- Call it from Python with PyO3\n- Benchmark it against the Python version\n\n" +
      "Bring a laptop with Rust installed (rustup is enough). Pizza from 18:30.",
    day_offset: 8,
    weekday: 2,
    start_time: "18:30",
    end_time: "21:00",
    venue_name: "Canal Works",
    venue_address: "12 Wharf Road, London N1 7GR",
    online_url: null,
    cover_url: "/covers/oss-sprint.svg",
    capacity: 35,
    price_label: "Free",
    hosts: [{ name: "Jonah Pike", avatar_url: null }],
    status: "renegotiating",
    source: "bot",
    created_days_ago: 1,
    approvals: [
      { team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "approved", note: null },
      { team_id: CANAL, approver_name: "Maya Brooks", decision: "renegotiate", note: "Can we move this to a Thursday? Our Tuesday slot is taken." },
    ],
    going: 0,
    waitlist: 0,
  },
  {
    id: "e0000000-0000-4000-8000-000000000008",
    slug: "founder-pitch-night",
    title: "Founder Pitch Night: Meet the Investors",
    event_type: "other",
    communities: ["Startup Grind LDN"],
    description_md:
      "Pitch your startup to a panel of angel investors. Five minutes per founder, feedback from the panel, networking after.\n\n" +
      "Tickets include a 1:1 slot with a sponsor.",
    day_offset: 12,
    start_time: "18:00",
    end_time: "21:00",
    venue_name: "Canal Works",
    venue_address: "12 Wharf Road, London N1 7GR",
    online_url: null,
    cover_url: "/covers/lightning-talks.svg",
    capacity: 60,
    price_label: "£25",
    hosts: [{ name: "Growth Partners Ltd", avatar_url: null }],
    status: "rejected",
    source: "bot",
    created_days_ago: 3,
    approvals: [
      { team_id: BUILDERS, approver_name: "Tom Adeyemi", decision: "rejected", note: "This is a paid sponsor pitch, not a community event. Our calendar is free events run by the community." },
    ],
    going: 0,
    waitlist: 0,
  },
];

/** The event the bot proposes live in the demo (npm run demo:propose). */
export const DEMO_PROPOSAL = {
  title: "AI Builders Social × Expedite",
  event_type: "social",
  communities: ["Builders Collective", "Expedite"],
  description_md:
    "An evening social for London's AI builders, co-hosted with the Expedite crew.\n\n" +
    "- Lightning demos from the community (3 minutes each, sign up at the door)\n- Drinks and food from 19:00\n- No talks over 5 minutes, promise",
  venue_name: "Canal Works",
  venue_address: "12 Wharf Road, London N1 7GR",
  cover_url: "/covers/ai-social.svg",
  capacity: 80,
  hosts: [{ name: "Tom Adeyemi" }, { name: "Maya Brooks" }],
};
