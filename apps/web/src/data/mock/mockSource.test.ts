import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateDeal, type Card } from "@community-bots/core";
import { diffDeals } from "../../lib/dealDiff";
import { classifyRun } from "../../lib/lanes";
import { DataError, type Message, type NegotiateJobResult } from "../types";
import { MockSource } from "./mockSource";
import { SAMPLE_VIEWER_ID } from "./seed";

const NOW = new Date("2026-10-22T10:00:00Z");

let source: MockSource;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  source?.dispose();
  vi.useRealTimers();
});

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

async function startRun(leadId: string, partnerIds: string[], need: string): Promise<string> {
  const jobId = await source.submitJob(null, "negotiate", { leadId, partnerIds, need });
  await tick(1000);
  const job = await source.getJob(jobId);
  expect(job?.status).toBe("done");
  return (job!.result as NegotiateJobResult).runId;
}

async function waitFor<T>(check: () => Promise<T | null | undefined | false>, maxMs = 180_000): Promise<T> {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += 250) {
    const value = await check();
    if (value) return value;
    await tick(250);
  }
  throw new Error("condition never became true");
}

const botPosts = async (runId: string): Promise<Message[]> => (await source.listMessages(runId)).filter((m) => m.role === "bot");

async function tokenFor(runId: string, communityId: string): Promise<string> {
  const rows = await source.presenterStatus("any", runId);
  return rows.find((r) => r.communityId === communityId)!.token;
}

describe("mock sample world", () => {
  it("seeds 12 sample communities and runs for every lane, with one negotiating live", async () => {
    source = new MockSource({ storage: null });
    const communities = await source.listCommunities();
    expect(communities).toHaveLength(12);
    expect(communities.filter((c) => c.status === "draft").length).toBeGreaterThan(0);
    const lanes = (await source.listRuns()).map(classifyRun);
    expect(lanes).toEqual(expect.arrayContaining(["negotiating", "waiting", "confirmed", "ended"]));
    const runs = await source.listRuns();
    expect(runs.every((r) => r.backend === "mock")).toBe(true);
  });

  it("has a round-2 deal waiting on the sample organiser, and the deal changed between rounds", async () => {
    source = new MockSource({ storage: null });
    const me = source.sampleIdentity()!;
    expect(me.communityId).toBe(SAMPLE_VIEWER_ID);
    const requests = await source.listRequests(me.inbox);
    const waiting = requests.find((r) => r.status === "pending" && r.round === 2);
    expect(waiting).toBeTruthy();
    const deals = await source.listDeals(waiting!.runId!);
    expect(deals.map((d) => d.round)).toEqual([1, 2]);
    expect(diffDeals(deals[0].deal, deals[1].deal).count).toBeGreaterThan(0);
  });
});

describe("mock negotiation life cycle", () => {
  beforeEach(() => {
    source = new MockSource({ storage: null, seedRuns: false });
  });

  it("posts Bot messages 2 to 4 seconds apart and compiles a deal that passes the core rules", async () => {
    const runId = await startRun("northside-founders-circle", ["riverside-makers", "design-systems-club", "bike-kitchen-collective"], "A demo night for 60 people next month. We need a bigger venue and a couple of speakers.");
    source.setViewer(["northside-founders-circle"]);
    const run = await waitFor(async () => {
      const r = await source.getRun(runId);
      return r?.status === "pending_approval" ? r : null;
    });
    const posts = await botPosts(runId);
    const gaps = posts.slice(1).map((m, i) => Date.parse(m.createdAt) - Date.parse(posts[i].createdAt));
    expect(gaps.every((g) => g >= 2000 && g <= 4300)).toBe(true);
    // The weekend-only partner declines; the 50-person room counters on size.
    expect(posts.some((m) => m.communityId === "bike-kitchen-collective" && m.stance === "decline")).toBe(true);
    expect(posts.some((m) => m.communityId === "riverside-makers" && m.stance === "counter")).toBe(true);

    const deal = (await source.getDeal(run.dealId!))!.deal;
    const cards = (await source.listCommunities()).filter((c) => deal.communities.some((d) => d.id === c.id)).map((c) => c.card);
    expect(validateDeal(deal, { cards, leadId: "northside-founders-circle", now: NOW }).ok).toBe(true);
    expect(deal.communities.map((c) => c.id)).not.toContain("bike-kitchen-collective");
  });

  it("a steer changes the next Bot reply and the deal", async () => {
    const runId = await startRun("canal-street-coders", ["open-data-collective", "northern-data-guild"], "A beginner data workshop for 40 people. We need a space and a few mentors.");
    source.setViewer(["canal-street-coders"]);
    await waitFor(async () => (await botPosts(runId)).length >= 1);
    const before = (await botPosts(runId)).length;
    await source.postMessage(null, runId, "Keep it under 30 people", null);
    const next = await waitFor(async () => {
      const posts = await botPosts(runId);
      return posts.length > before ? posts[before] : null;
    });
    expect(next.text).toMatch(/^Noted, organiser: capped at 25 people/);
    const run = await waitFor(async () => {
      const r = await source.getRun(runId);
      return r?.status === "pending_approval" ? r : null;
    });
    expect((await source.getDeal(run.dealId!))!.deal.capacity).toBe(25);
  });

  it("speaking for a community takes that community's Bot turn", async () => {
    const runId = await startRun("canal-street-coders", ["open-data-collective", "northern-data-guild"], "A beginner data workshop for 40 people. We need a space and a few mentors.");
    source.setViewer(["canal-street-coders"]);
    // Wait until the lead has opened, so the next turn belongs to the first partner.
    await waitFor(async () => (await botPosts(runId)).length >= 1);
    await source.postMessage(null, runId, "We can host in our meeting room and bring two speakers.", "open-data-collective");
    await waitFor(async () => (await source.getRun(runId))?.status === "pending_approval");
    const messages = await source.listMessages(runId);
    const takeover = messages.find((m) => m.role === "human" && m.communityId === "open-data-collective")!;
    const firstPartnerBot = messages.find((m) => m.role === "bot" && m.communityId === "open-data-collective");
    // The partner's opening turn was the human's; its Bot only speaks later, to reply to the proposal.
    expect(firstPartnerBot!.seq).toBeGreaterThan(takeover.seq);
    expect(firstPartnerBot!.text).not.toMatch(/^We can offer/);
  });

  it("renegotiating starts round 2 with a changed deal, then approvals confirm it", async () => {
    const lead = "canal-street-coders";
    const runId = await startRun(lead, ["open-data-collective", "northern-data-guild"], "A beginner data workshop for 40 people. We need a space and a few mentors.");
    source.setViewer([lead]);
    await waitFor(async () => (await source.getRun(runId))?.status === "pending_approval");
    await source.respond(await tokenFor(runId, lead), "renegotiate", "Could we start an hour earlier?", ["Different time"]);
    const round2 = await waitFor(async () => {
      const r = await source.getRun(runId);
      return r?.round === 2 && r.status === "pending_approval" ? r : null;
    });
    const deals = await source.listDeals(runId);
    expect(deals.map((d) => d.round)).toEqual([1, 2]);
    const diff = diffDeals(deals[0].deal, deals[1].deal);
    expect(diff.fields.time).toBeTruthy();

    // Simulated partners approve round 2; the human approves last.
    await waitFor(async () => {
      const rows = await source.presenterStatus("any", runId);
      return rows.filter((r) => r.communityId !== lead).every((r) => r.status === "approved");
    });
    await source.respond(await tokenFor(runId, lead), "approved", null, []);
    await waitFor(async () => (await source.getRun(runId))?.status === "confirmed");
    const event = await source.getEvent(round2.dealId!);
    expect(event.allApproved).toBe(true);
  });

  it("declining needs a note and ends the run", async () => {
    const lead = "canal-street-coders";
    const runId = await startRun(lead, ["open-data-collective"], "A beginner data workshop for 40 people. We need a space.");
    source.setViewer([lead, "open-data-collective"]);
    await waitFor(async () => (await source.getRun(runId))?.status === "pending_approval");
    const token = await tokenFor(runId, lead);
    await expect(source.respond(token, "declined", "no", [])).rejects.toBeInstanceOf(DataError);
    await source.respond(token, "declined", "Our members are away that week", ["Date doesn't work"]);
    const run = (await source.getRun(runId))!;
    expect(run.status).toBe("declined");
    expect(run.declineReason).toBe("Our members are away that week");
    expect(classifyRun(run)).toBe("ended");
    await expect(source.respond(token, "approved", null, [])).rejects.toMatchObject({ code: "conflict" });
  });

  it("pause holds the Bots, resume continues, stop ends the run", async () => {
    const runId = await startRun("canal-street-coders", ["open-data-collective"], "A beginner data workshop for 40 people. We need a space.");
    await waitFor(async () => (await botPosts(runId)).length >= 1);
    await source.setRunControl(null, runId, "pause");
    const paused = (await botPosts(runId)).length;
    await tick(15_000);
    expect((await botPosts(runId)).length).toBe(paused);
    await source.setRunControl(null, runId, "resume");
    await waitFor(async () => (await botPosts(runId)).length > paused);
    await source.setRunControl(null, runId, "stop");
    const stopped = (await source.getRun(runId))!;
    expect(stopped.control).toBe("stopped");
    expect(classifyRun(stopped)).toBe("ended");
  });
});

describe("mock jobs", () => {
  beforeEach(() => {
    source = new MockSource({ storage: null, seedRuns: false });
  });

  it("drafts a card with GUESS fields from a URL and saves it with an organiser inbox", async () => {
    const jobId = await source.submitJob(null, "draft_card", { url: "https://www.meetup.com/salford-ai-builders/" });
    await tick(800);
    expect((await source.getJob(jobId))?.progress).toBe("browsing");
    await tick(3000);
    const job = (await source.getJob(jobId))!;
    expect(job.status).toBe("done");
    const card = (job.result as { card: { name: string; id: string; tagline: string } }).card;
    expect(card.name).toBe("Salford AI Builders");
    expect(card.tagline.startsWith("GUESS: ")).toBe(true);
    const saved = await source.saveCard(null, (job.result as { card: Card }).card, "confirmed");
    expect(saved.id).toBe("salford-ai-builders");
    expect(await source.resolveInbox(saved.inbox!)).toEqual({ communityId: "salford-ai-builders", name: "Salford AI Builders" });
  });

  it("reports a readable error for a bad URL", async () => {
    const jobId = await source.submitJob(null, "draft_card", { url: "not a link" });
    await tick(4000);
    const job = (await source.getJob(jobId))!;
    expect(job.status).toBe("error");
    expect(job.error).toMatch(/web address/);
  });

  it("ranks matches with reasons quoted from each candidate's card", async () => {
    const jobId = await source.submitJob(null, "match", { leadId: "canal-street-coders", need: "A workshop for 40 people. We need a space and mentors." });
    await tick(2500);
    const result = (await source.getJob(jobId))!.result as { candidates: { communityId: string; fit: string; reasons: { evidence: string; cardOwnerId: string }[] }[] };
    expect(result.candidates.length).toBeGreaterThan(2);
    expect(result.candidates[0].fit).toBe("strong");
    const cards = Object.fromEntries((await source.listCommunities()).map((c) => [c.id, c.card]));
    for (const candidate of result.candidates) {
      for (const reason of candidate.reasons) {
        expect(reason.cardOwnerId).toBe(candidate.communityId);
        expect(JSON.stringify(cards[reason.cardOwnerId])).toContain(reason.evidence);
      }
    }
  });
});
