export interface QuickChip {
  label: string;
  note: string;
}

export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

/** Renegotiate and decline notes need at least 3 characters (the backend rejects shorter ones). */
export function noteIsValid(note: string): boolean {
  return note.trim().length >= NOTE_MIN;
}

export interface ChipState {
  /** Chip labels in the order they were tapped. Sent to the backend as the quick reasons. */
  selected: string[];
  note: string;
}

export const EMPTY_CHIPS: ChipState = { selected: [], note: "" };

/** The note the selected chips write when the person has not typed their own. */
export function chipNote(chips: QuickChip[], selected: string[]): string {
  return selected
    .map((label) => chips.find((chip) => chip.label === label)?.note)
    .filter((note): note is string => !!note)
    .join(" ");
}

/**
 * Toggles a quick chip. The note follows the chips while it is empty or still exactly what
 * the chips wrote; once the person types their own words, the chips leave the note alone.
 */
export function toggleChip(state: ChipState, chips: QuickChip[], label: string): ChipState {
  const selected = state.selected.includes(label) ? state.selected.filter((l) => l !== label) : [...state.selected, label];
  const chipWritten = state.note.trim() === "" || state.note.trim() === chipNote(chips, state.selected);
  return { selected, note: chipWritten ? chipNote(chips, selected) : state.note };
}
