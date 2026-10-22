import { describe, expect, it } from "vitest";
import { createBackend } from "./backends";
import type { Backend } from "./backends/types";
import { addDays, allowedDaysForAll, dayOfWeek, nextAllowedDate, todayIso } from "./dates";
import { verifyEvidence, flattenCardEntries } from "./evidence";
import { messageDelayMs } from "./pacing";
import { isGuess } from "./card";
import { draftCard, matchCommunities, runNegotiation, type Participant } from "./orchestrator";
import type { Card } from "./schemas";

function card(
  partial: Partial<Omit<Card, "constraints">> & Pick<Card, "id" | "name"> & { constraints?: Partial<Card["constraints"]> },
): Card {
  const { constraints, ...rest } = partial;
  return {
    tagline: null,
    location: null,
    members: null,
    runs: [],
    offers: ["a shared room"],
    needs: [],
    tone: "warm and plain",
    sourceUrls: [`https://example.test/${partial.id}`],
    ...rest,
    constraints: { days: [], maxGroupSize: null, notes: null, ...constraints },
  };
}

const participant = (value: Card, status: Participant["status"] = "confirmed"): Participant => ({
  card: value,
  status,
});

describe("draftCard on the mock backend", () => {
  it("builds a card from the name hint and URL, with one guess and no invented counts", async () => {
    const backend = createBackend("mock");
    const url = "https://example.com/cedar-hall";
    const drafted = await draftCard({
      backend,
      url,
      nameHint: "Cedar Hall",
      pages: [{ url: "https://example.com/cedar-hall/about", title: "About", text: "We meet Wednesdays. 400 members." }],
    });
    expect(drafted.id).toBe("cedar-hall");
    expect(drafted.name).toBe("Cedar Hall");
    expect(drafted.members).toBeNull();
    expect(drafted.sourceUrls).toContain(url);
    expect(JSON.stringify(drafted)).not.toContain("400");
    expect(JSON.stringify(drafted)).not.toContain("Wednesdays");
    const guesses = flattenCardEntries(drafted).filter((entry) => isGuess(entry.value));
    expect(guesses).toHaveLength(1);
  });
});

describe("matchCommunities", () => {
  it("drops reasons that are not on the named card and keeps at most three", async () => {
    const lead = card({ id: "north-lantern", name: "North Lantern", offers: ["glasshouse evenings"] });
    const cedar = card({ id: "cedar-workshop", name: "Cedar Workshop", offers: ["weekday facilitators"] });
    const bright = card({ id: "bright-table", name: "Bright Table", offers: ["quiet discussion prompts"] });
    const harbour = card({ id: "harbour-circle", name: "Harbour Circle", offers: ["harbour maps"] });
    const meadow = card({ id: "meadow-room", name: "Meadow Room", offers: ["meadow picnic blankets"] });
    const backend: Backend = {
      name: "mock",
      canBrowse: false,
      async ask() {
        const reason = (communityId: string, evidence: string) => ({
          communityId,
          fit: "good" as const,
          reasons: [{ claim: "Fits", evidence, cardOwnerId: communityId }],
          concerns: [],
        });
        return JSON.stringify([
          reason("cedar-workshop", "not written on the card"),
          reason("bright-table", "quiet discussion prompts"),
          reason("harbour-circle", "harbour maps"),
          reason("meadow-room", "meadow picnic blankets"),
          reason("ghost-guild", "glasshouse evenings"),
        ]);
      },
    };
    const matched = await matchCommunities({
      backend,
      lead: participant(lead),
      need: "Host a small weekday workshop",
      candidates: [cedar, bright, harbour, meadow].map((value) => participant(value)),
    });
    expect(matched.map((candidate) => candidate.communityId)).toEqual(["bright-table", "harbour-circle", "meadow-room"]);
    expect(matched[0]?.reasons).toEqual([
      { claim: "Fits", evidence: "quiet discussion prompts", cardOwnerId: "bright-table" },
    ]);
  });

  it("ranks by overlap and copies evidence from the named card", async () => {
    const lead = card({ id: "pottery-loft", name: "Pottery Loft", offers: ["kiln time"] });
    const lantern = card({
      id: "lantern-hall",
      name: "Lantern Hall",
      tagline: "weekday workshops",
      offers: ["lantern hall evenings"],
    });
    const readers = card({ id: "quiet-readers", name: "Quiet Readers", offers: ["sea shanties"] });
    const matched = await matchCommunities({
      backend: createBackend("mock"),
      lead: participant(lead),
      need: "Plan a weekday lantern workshop",
      candidates: [readers, lantern].map((value) => participant(value)),
    });
    expect(matched[0]?.communityId).toBe("lantern-hall");
    expect(matched[0]?.fit).toBe("strong");
    expect(verifyEvidence(matched[0]?.reasons[0]?.evidence ?? "", lantern)).toBe(true);
    expect(matched.every((candidate) => candidate.communityId !== lead.id)).toBe(true);
    expect(matched.length).toBeLessThanOrEqual(3);
  });
});

describe("runNegotiation on the mock backend", () => {
  it("agrees a future deal on a shared weekday, with verified evidence and announcements", async () => {
    const now = new Date();
    const days = ["Wed", "Thu"] as const;
    const lead = card({
      id: "north-lantern",
      name: "North Lantern",
      location: "Glasshouse",
      offers: ["glasshouse evenings"],
      tone: "warm and plain",
      constraints: { days: [...days], maxGroupSize: 40 },
    });
    const cedar = card({
      id: "cedar-workshop",
      name: "Cedar Workshop",
      offers: ["weekday facilitators"],
      tone: "curious and brief",
      constraints: { days: [...days], maxGroupSize: 18 },
    });
    const bright = card({
      id: "bright-table",
      name: "Bright Table",
      offers: ["quiet discussion prompts"],
      tone: "direct and friendly",
      constraints: { days: [...days], maxGroupSize: null },
    });
    const cards = [lead, cedar, bright];
    const expectedDate = nextAllowedDate(addDays(todayIso(now), 14), allowedDaysForAll(cards.map((value) => value.constraints.days)));
    const originalFetch = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = () => {
      fetched = true;
      throw new Error("network");
    };
    try {
      const phases: string[] = [];
      const outcome = await runNegotiation({
        backend: createBackend("mock"),
        runId: "run-mock",
        need: "Host a small weekday workshop for both groups",
        lead: participant(lead),
        partners: [participant(cedar), participant(bright)],
        now,
        onPhase: (phase) => {
          phases.push(phase);
        },
      });

      expect(fetched).toBe(false);
      expect(phases).toEqual(["negotiating", "compiling"]);
      expect(outcome.stopped).toBe(false);
      expect(outcome.messages.length).toBeGreaterThan(1);
      expect(outcome.messages[0]).toMatchObject({ seq: 0, role: "human", stance: null, text: "Host a small weekday workshop for both groups" });
      expect(outcome.consensus).toBe(true);
      expect(outcome.agreedIds).toEqual(["north-lantern", "cedar-workshop", "bright-table"]);
      expect(outcome.messages.filter((message) => message.role === "bot").map((message) => message.stance)).toEqual([
        "offer",
        "offer",
        "offer",
        "offer",
        "accept",
        "accept",
      ]);
      for (const message of outcome.messages) {
        expect(message.delayMs).toBe(messageDelayMs(message.text));
        if (!message.evidence) continue;
        const own = cards.find((value) => value.id === message.communityId);
        expect(own).toBeTruthy();
        expect(verifyEvidence(message.evidence.quote, own!)).toBe(true);
        expect(message.evidence.verified).toBe(true);
      }
      expect(outcome.deal).not.toBeNull();
      const deal = outcome.deal!;
      expect(deal.date).toBe(expectedDate);
      expect(deal.date > todayIso(now)).toBe(true);
      expect(days).toContain(dayOfWeek(deal.date));
      expect(deal.venue).toBe("Glasshouse");
      expect(deal.capacity).toBe(18);
      expect(deal.status).toBe("pending_approval");
      expect(deal.communities.find((community) => community.id === lead.id)?.role).toBe("host");
      expect(deal.communities.filter((community) => community.id !== lead.id).every((community) => community.role === "co-host")).toBe(true);
      expect(deal.description.trim().split(/\s+/).length).toBeLessThanOrEqual(40);
      for (const reason of deal.reasons) {
        const own = cards.find((value) => value.id === reason.communityId);
        expect(verifyEvidence(reason.evidence, own!)).toBe(true);
      }
      expect(outcome.announcements.map((item) => item.communityId)).toEqual(deal.communities.map((community) => community.id));
      for (const announcement of outcome.announcements) {
        expect(announcement.text.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(50);
        expect(announcement.text).toContain(deal.date);
        expect(announcement.text).toContain(deal.title);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
