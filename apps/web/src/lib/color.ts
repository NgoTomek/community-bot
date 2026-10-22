/**
 * Stable colour per community, derived from its id. Every swatch keeps white initials
 * above 4.5:1 contrast, in light and dark themes.
 */
const SWATCHES = [
  "#3e6b5a",
  "#7a4e8c",
  "#9c5b2e",
  "#2e6187",
  "#8a3b4e",
  "#5b6b2e",
  "#2f7a7a",
  "#6b5b95",
  "#a0522d",
  "#46627f",
  "#7d5a3c",
  "#3d7a45",
  "#8c5a7a",
  "#6e6a2a",
  "#8f4a6e",
  "#5d6470",
] as const;

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function communityColor(id: string): string {
  return SWATCHES[hashString(id) % SWATCHES.length];
}

const SKIP = new Set(["the", "of", "and", "&", "for", "a", "an", "at", "in", "x"]);

/** "Canal Street Coders" -> "CC", "The Open Data Collective" -> "OC", "Riverside" -> "RI". */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
