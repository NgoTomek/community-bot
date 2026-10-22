import { addDays, dayOfWeek, todayIso } from "@community-bots/core";
import { describe, expect, it } from "vitest";
import { factualAnnouncement } from "./announce";
import { loadSampleDeal } from "./sampleFixture";

describe("sample fixture", () => {
  it("is a valid Thursday deal at least 14 days ahead", () => {
    const now = new Date();
    const { sample, deal, date } = loadSampleDeal(now);
    expect(date).toBe(deal.date);
    expect(dayOfWeek(deal.date)).toBe("Thu");
    expect(deal.date >= addDays(todayIso(now), 14)).toBe(true);
    expect(deal.date < addDays(todayIso(now), 21)).toBe(true);
    expect(deal.capacity).toBe(40);
    expect(deal.status).toBe("pending_approval");
    expect(sample.communities.map((entry) => entry.card.constraints.maxGroupSize)).toEqual([40, 80, null]);
    expect(sample.communities.every((entry) => entry.card.constraints.days.includes("Thu"))).toBe(true);
    expect(sample.communities[0]?.card.offers).toContain("A room for 40");
    expect(sample.communities[1]?.card.offers).toContain("A co-host and a mailing list");
    expect(sample.communities[2]?.card.offers).toContain("Speakers on AI agents");
    expect(sample.run.need).toBe("AI agents workshop, 40 people, next month, need a space and a co-host");
    expect(sample.run.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(sample.deal.id).toBe("22222222-2222-4222-8222-222222222222");
  });
});

describe("factualAnnouncement", () => {
  it("uses the community name, title, and date, and stays within 50 words", () => {
    const text = factualAnnouncement("Harbor House", "AI agents workshop", "2026-11-05");
    expect(text).toContain("Harbor House");
    expect(text).toContain("AI agents workshop");
    expect(text).toContain("2026-11-05");
    expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(50);
  });
});
