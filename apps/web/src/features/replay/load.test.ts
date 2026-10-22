import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MockSource } from "../../data/mock/mockSource";
import { buildTimeline } from "../../lib/timeline";
import { parseExportedRun } from "./exported";
import { buildSteps, frameAt } from "./frames";
import { loadDemoReplay, loadRunReplay } from "./load";

let source: MockSource | null = null;
afterEach(() => {
  source?.dispose();
  source = null;
});

const notFound = async () => ({ ok: false, json: async () => null });
const htmlFallback = async () => ({
  ok: true,
  json: async () => {
    throw new SyntaxError("Unexpected token '<'");
  },
});
const bundledFile = () => JSON.parse(readFileSync(new URL("../../../public/demo-run.json", import.meta.url), "utf8")) as unknown;

describe("loadRunReplay", () => {
  it("replays every sample run and ends on its real outcome", async () => {
    source = new MockSource({ storage: null });
    const runs = await source.listRuns();
    expect(runs.length).toBeGreaterThan(3);
    for (const run of runs) {
      const bundle = await loadRunReplay(source, run.id);
      expect(bundle?.threadRunId).toBe(run.id);
      const data = bundle!.data;
      const steps = buildSteps(data);
      const end = frameAt(steps, data.run, steps.length);
      const items = buildTimeline({ run: end.run, messages: end.messages, deals: end.deals, approvals: [] });
      expect(end.posts.total).toBe((await source.listMessages(run.id)).length);
      expect(items.filter((i) => i.kind === "event" && i.event === "deal")).toHaveLength(data.deals.length);
      expect(bundle!.eventDealId).toBe(data.deals.length ? run.dealId : null);
      if (run.status === "confirmed") expect(items[items.length - 1].key).toBe("confirmed");
      if (run.status === "declined") expect(items.some((i) => i.kind === "event" && i.event === "declined")).toBe(true);
    }
  });

  it("starts round 2 with its first post in a two-round run", async () => {
    source = new MockSource({ storage: null });
    const run = (await source.listRuns()).find((r) => r.round === 2)!;
    const data = (await loadRunReplay(source, run.id))!.data;
    const steps = buildSteps(data);
    const firstDeal = steps.findIndex((s) => s.kind === "deal");
    const atDeal = frameAt(steps, data.run, firstDeal + 1);
    expect(buildTimeline({ ...atDeal, approvals: [] }).some((i) => i.key === "round:2")).toBe(false);
    const nextPost = frameAt(steps, data.run, firstDeal + 2);
    const items = buildTimeline({ ...nextPost, approvals: [] });
    expect(items.map((i) => i.key).slice(-2)).toEqual(["round:2", `m:${nextPost.messages[nextPost.messages.length - 1].id}`]);
  });

  it("returns null for a run the data source does not have", async () => {
    source = new MockSource({ storage: null, seedRuns: false });
    expect(await loadRunReplay(source, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("loadDemoReplay", () => {
  it("falls back to the sample world's confirmed run when the file is missing or not JSON", async () => {
    source = new MockSource({ storage: null });
    for (const fetcher of [notFound, htmlFallback]) {
      const bundle = await loadDemoReplay(source, "/demo-run.json", fetcher);
      expect(bundle.data.origin).toBe("sample");
      expect(bundle.data.run).toMatchObject({ status: "confirmed", backend: "mock" });
      expect(bundle.data.messages.length).toBeGreaterThan(1);
      // The sample world in the data source has the same run, so the links point at its copy.
      const live = await source.getRun(bundle.data.run.id);
      expect(bundle.threadRunId).toBe(live?.id);
      expect(bundle.eventDealId).toBe(live?.dealId);
    }
  });

  it("plays the bundled demo-run.json and only links to what the data source has", async () => {
    const file = bundledFile();
    expect(parseExportedRun(file)).not.toBeNull();
    source = new MockSource({ storage: null, seedRuns: false });
    const bundle = await loadDemoReplay(source, "/demo-run.json", async () => ({ ok: true, json: async () => file }));
    expect(bundle.data.origin).toBe("file");
    expect(bundle.data.run.backend).toBe("mock");
    expect(bundle.data.deals).toHaveLength(1);
    expect(bundle.threadRunId).toBeNull();
    expect(bundle.eventDealId).toBeNull();
  });
});
