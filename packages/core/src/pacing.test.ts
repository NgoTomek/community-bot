import { describe, expect, it } from "vitest";
import { messageDelayMs } from "./pacing";

describe("messageDelayMs", () => {
  it("is min(4000, 700 + 25 * chars)", () => {
    expect(messageDelayMs("")).toBe(700);
    expect(messageDelayMs("hello")).toBe(700 + 25 * 5);
    expect(messageDelayMs("a".repeat(132))).toBe(4000);
    expect(messageDelayMs("a".repeat(133))).toBe(4000);
  });
});
