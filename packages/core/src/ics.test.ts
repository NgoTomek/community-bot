import { describe, expect, it } from "vitest";
import { buildIcs, dealEndMinutes } from "./ics";
import { messageDelayMs } from "./pacing";
import type { Deal } from "./schemas";

const NOW = new Date("2026-03-15T12:00:00.000Z");

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    title: "Joint mixer",
    date: "2026-03-20",
    time: "18:30",
    venue: "The Warehouse, Dock 4",
    capacity: 40,
    description: "A small mixer.",
    communities: [
      { id: "river-club", name: "River Club", role: "host", brings: ["venue"] },
      { id: "cedar-circle", name: "Cedar Circle", role: "audience", brings: ["speakers"] },
    ],
    agenda: [{ time: "18:30", item: "Doors" }],
    reasons: [],
    consensus: true,
    status: "pending_approval",
    ...overrides,
  };
}

function physicalLines(ics: string): string[] {
  const body = ics.endsWith("\r\n") ? ics.slice(0, -2) : ics;
  return body.split("\r\n");
}

function unfold(ics: string): string[] {
  const lines: string[] = [];
  for (const line of physicalLines(ics)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

function prop(ics: string, name: string): string | undefined {
  return unfold(ics).find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1);
}

describe("buildIcs", () => {
  it("uses CRLF line endings and a trailing CRLF", () => {
    const ics = buildIcs(deal(), { uid: "abc", now: NOW });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("folds content lines at 75 octets, with a leading space on continuations", () => {
    const long = deal({
      description:
        "A small joint mixer for both groups with a very long description that should force folding because RFC 5545 wants seventy-five octet lines and we need to check that.",
    });
    const ics = buildIcs(long, { uid: "abc", url: "https://example.test/e", now: NOW });
    for (const line of physicalLines(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(physicalLines(ics).some((line) => line.startsWith(" "))).toBe(true);
  });

  it("escapes commas, semicolons, backslashes and newlines", () => {
    const ics = buildIcs(
      deal({
        title: "Meet; greet",
        venue: "Hall, room 2",
        description: "Line one\nLine two\\more",
      }),
      { uid: "abc", now: NOW },
    );
    expect(prop(ics, "SUMMARY")).toBe("Meet\\; greet");
    expect(prop(ics, "LOCATION")).toBe("Hall\\, room 2");
    const description = prop(ics, "DESCRIPTION") ?? "";
    expect(description.startsWith("Line one\\nLine two\\\\more")).toBe(true);
    expect(description).toContain("River Club\\, Cedar Circle");
  });

  it("emits floating DTSTART/DTEND with no Z", () => {
    const ics = buildIcs(deal(), { uid: "abc", now: NOW });
    expect(prop(ics, "DTSTART")).toBe("20260320T183000");
    expect(prop(ics, "DTEND")).toBe("20260320T203000");
    expect(prop(ics, "DTSTART")?.endsWith("Z")).toBe(false);
    expect(prop(ics, "DTEND")?.endsWith("Z")).toBe(false);
    expect(prop(ics, "DTSTAMP")).toBe("20260315T120000Z");
  });

  it("sets DTEND from the last later agenda item + 30m, else start + 2h", () => {
    const withAgenda = deal({
      time: "18:00",
      agenda: [
        { time: "18:00", item: "Doors" },
        { time: "20:00", item: "Close" },
      ],
    });
    expect(dealEndMinutes(withAgenda)).toBe(20 * 60 + 30);
    expect(prop(buildIcs(withAgenda, { uid: "abc", now: NOW }), "DTEND")).toBe("20260320T203000");

    const noLater = deal({ time: "18:00", agenda: [{ time: "18:00", item: "Doors" }] });
    expect(dealEndMinutes(noLater)).toBe(18 * 60 + 120);
    expect(prop(buildIcs(noLater, { uid: "abc", now: NOW }), "DTEND")).toBe("20260320T200000");
  });

  it("sets STATUS CONFIRMED vs TENTATIVE", () => {
    expect(prop(buildIcs(deal(), { uid: "abc", now: NOW, confirmed: true }), "STATUS")).toBe("CONFIRMED");
    expect(prop(buildIcs(deal(), { uid: "abc", now: NOW, confirmed: false }), "STATUS")).toBe("TENTATIVE");
    expect(prop(buildIcs(deal(), { uid: "abc", now: NOW }), "STATUS")).toBe("TENTATIVE");
  });
});

describe("messageDelayMs", () => {
  it("is min(4000, 700 + 25 * chars)", () => {
    expect(messageDelayMs("")).toBe(700);
    expect(messageDelayMs("a")).toBe(725);
    expect(messageDelayMs("a".repeat(132))).toBe(4000);
    expect(messageDelayMs("a".repeat(133))).toBe(4000);
    expect(messageDelayMs("a".repeat(200))).toBe(4000);
  });
});
