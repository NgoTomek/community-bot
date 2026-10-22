import { describe, expect, it } from "vitest";
import { chipNote, EMPTY_CHIPS, noteIsValid, toggleChip, type QuickChip } from "./logic";

const CHIPS: QuickChip[] = [
  { label: "Different date", note: "Can we find a different date?" },
  { label: "Smaller group", note: "Can we keep the group smaller?" },
];

describe("noteIsValid", () => {
  it("needs at least 3 characters after trimming", () => {
    expect(noteIsValid("")).toBe(false);
    expect(noteIsValid("ok")).toBe(false);
    expect(noteIsValid("   no   ")).toBe(false);
    expect(noteIsValid("   yes   ")).toBe(true);
    expect(noteIsValid("  a \n ")).toBe(false);
    expect(noteIsValid("Can we move it?")).toBe(true);
  });
});

describe("toggleChip", () => {
  it("selects a chip and fills an empty note with its text", () => {
    const next = toggleChip(EMPTY_CHIPS, CHIPS, "Different date");
    expect(next).toEqual({ selected: ["Different date"], note: "Can we find a different date?" });
  });

  it("adds the next chip's text while the note is still the chips' own", () => {
    const one = toggleChip(EMPTY_CHIPS, CHIPS, "Smaller group");
    const two = toggleChip(one, CHIPS, "Different date");
    expect(two.selected).toEqual(["Smaller group", "Different date"]);
    expect(two.note).toBe("Can we keep the group smaller? Can we find a different date?");
  });

  it("deselects a chip and takes its text back out", () => {
    const two = toggleChip(toggleChip(EMPTY_CHIPS, CHIPS, "Different date"), CHIPS, "Smaller group");
    const back = toggleChip(two, CHIPS, "Different date");
    expect(back).toEqual({ selected: ["Smaller group"], note: "Can we keep the group smaller?" });
    expect(toggleChip(back, CHIPS, "Smaller group")).toEqual({ selected: [], note: "" });
  });

  it("never overwrites words the person typed", () => {
    const typed = { selected: [], note: "Our hall is booked that week" };
    const next = toggleChip(typed, CHIPS, "Different date");
    expect(next).toEqual({ selected: ["Different date"], note: "Our hall is booked that week" });
    const edited = { ...toggleChip(EMPTY_CHIPS, CHIPS, "Different date"), note: "Can we find a different date? Not the 19th." };
    expect(toggleChip(edited, CHIPS, "Smaller group").note).toBe("Can we find a different date? Not the 19th.");
    expect(toggleChip(edited, CHIPS, "Different date")).toEqual({ selected: [], note: "Can we find a different date? Not the 19th." });
  });

  it("fills again after the person clears the note", () => {
    const cleared = { selected: ["Different date"], note: "  " };
    expect(toggleChip(cleared, CHIPS, "Smaller group").note).toBe("Can we find a different date? Can we keep the group smaller?");
  });

  it("ignores unknown labels when writing the note", () => {
    expect(chipNote(CHIPS, ["Nope", "Smaller group"])).toBe("Can we keep the group smaller?");
  });
});
