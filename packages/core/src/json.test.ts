import { describe, expect, it } from "vitest";
import { extractJson, findBalancedBlock, JsonExtractError } from "./json";

describe("extractJson", () => {
  it("parses plain JSON objects and arrays", () => {
    expect(extractJson('{"ok": true, "n": 1}')).toEqual({ ok: true, n: 1 });
    expect(extractJson("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("parses fenced ```json blocks", () => {
    expect(extractJson('Sure.\n```json\n{"ok": true}\n```\n')).toEqual({ ok: true });
    expect(extractJson("```JSON\n[1]\n```")).toEqual([1]);
  });

  it("extracts JSON from surrounding prose", () => {
    expect(extractJson('Here is the deal: {"title": "Mixer"} thanks')).toEqual({ title: "Mixer" });
    expect(extractJson("Result: [1, 2, 3] done")).toEqual([1, 2, 3]);
  });

  it("keeps nested braces that live inside strings", () => {
    expect(extractJson('{"note": "use } carefully { please"}')).toEqual({ note: "use } carefully { please" });
    expect(extractJson('Prose {"note": "use } carefully"} extra')).toEqual({ note: "use } carefully" });
  });

  it("strips trailing commas", () => {
    expect(extractJson('{"a": 1,}')).toEqual({ a: 1 });
    expect(extractJson('{"a": [1, 2,],}')).toEqual({ a: [1, 2] });
  });

  it("does not strip commas that belong inside strings", () => {
    expect(extractJson('{"a": "x, } y", "b": 2,}')).toEqual({ a: "x, } y", b: 2 });
  });

  it("accepts smart double quotes as delimiters, including when a value contains braces", () => {
    expect(extractJson("{“ok”: true}")).toEqual({ ok: true });
    expect(extractJson("Here: {“note”: “use } carefully”, “n”: 1} thanks")).toEqual({
      note: "use } carefully",
      n: 1,
    });
  });

  it("throws JsonExtractError with a helpful message when empty or there is no JSON", () => {
    expect(() => extractJson("")).toThrow(JsonExtractError);
    expect(() => extractJson("   ")).toThrow(/Reply was empty; expected JSON/);
    expect(() => extractJson("sorry I cannot help")).toThrow(JsonExtractError);
    expect(() => extractJson("sorry I cannot help")).toThrow(/Could not parse JSON from reply/);
    expect(() => extractJson("sorry I cannot help")).toThrow(/Reply with JSON only/);
  });

  it("returns the first balanced block when two exist", () => {
    expect(extractJson('{"a": 1} {"b": 2}')).toEqual({ a: 1 });
    expect(extractJson('prefix [1, 2] then {"b": 2}')).toEqual([1, 2]);
  });
});

describe("findBalancedBlock", () => {
  it("skips braces that appear inside ASCII strings, including in leading prose", () => {
    expect(findBalancedBlock('The char "{" starts {"ok": true}')).toBe('{"ok": true}');
    expect(findBalancedBlock('{"a": "foo } bar"} extra')).toBe('{"a": "foo } bar"}');
  });

  it("returns the first complete object or array", () => {
    expect(findBalancedBlock("[1] [2]")).toBe("[1]");
    expect(findBalancedBlock("nope")).toBeNull();
  });
});
