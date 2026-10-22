import { describe, expect, it } from "vitest";
import { buildSteps, DRAFT_STEPS, MATCH_STEPS, stepIndex } from "./progress";

const states = (steps: ReturnType<typeof buildSteps>) => steps.map((s) => `${s.label}:${s.state}`);

describe("job progress steps", () => {
  it("recognises the mock's progress values and labels", () => {
    expect(stepIndex(DRAFT_STEPS, "browsing")).toBe(0);
    expect(stepIndex(DRAFT_STEPS, "Reading the page…")).toBe(1);
    expect(stepIndex(DRAFT_STEPS, " WRITING CARD ")).toBe(2);
    expect(stepIndex(MATCH_STEPS, "ranking communities")).toBe(1);
    expect(stepIndex(DRAFT_STEPS, "fetching sitemap")).toBe(-1);
    expect(stepIndex(DRAFT_STEPS, null)).toBe(-1);
  });

  it("ticks off the steps before the current one", () => {
    expect(states(buildSteps(DRAFT_STEPS, { status: "running", progress: "reading the page" }))).toEqual([
      "Browsing the page:done",
      "Reading the page:current",
      "Writing the card:todo",
    ]);
  });

  it("marks every step done when the job is done", () => {
    expect(buildSteps(DRAFT_STEPS, { status: "done", progress: null }).every((s) => s.state === "done")).toBe(true);
  });

  it("shows a queued job as waiting, before the first step", () => {
    const steps = buildSteps(DRAFT_STEPS, { status: "queued", progress: null });
    expect(steps[0]).toMatchObject({ state: "current", verbatim: true, label: "Waiting for a Bot to pick this up" });
    expect(steps.slice(1).every((s) => s.state === "todo")).toBe(true);
    expect(buildSteps(DRAFT_STEPS, null)[0].state).toBe("current");
  });

  it("shows unknown progress verbatim after the furthest step reached", () => {
    const steps = buildSteps(DRAFT_STEPS, { status: "running", progress: "fetching sitemap" }, 0);
    expect(states(steps)).toEqual(["Browsing the page:done", "fetching sitemap:current", "Reading the page:todo", "Writing the card:todo"]);
    expect(steps[1].verbatim).toBe(true);
    const first = buildSteps(DRAFT_STEPS, { status: "running", progress: "starting browser" });
    expect(states(first)[0]).toBe("starting browser:current");
  });

  it("never runs past the last step", () => {
    const steps = buildSteps(MATCH_STEPS, { status: "running", progress: null }, 9);
    expect(states(steps)).toEqual(["Reading the cards:done", "Ranking communities:done", "Finishing up:current"]);
  });
});
