/**
 * Lenient JSON extraction for model replies: tolerates code fences, prose around the JSON,
 * smart quotes used as delimiters and trailing commas. Throws JsonExtractError with a
 * readable message that can be fed back to the model.
 */
export class JsonExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonExtractError";
  }
}

export function extractJson(text: string): unknown {
  if (typeof text !== "string" || !text.trim()) throw new JsonExtractError("Reply was empty; expected JSON.");
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) candidates.push(match[1].trim());
  const block = findBalancedBlock(trimmed);
  if (block) candidates.push(block);
  // Repair first so smart-quoted JSON still yields a full block when a value contains `{` / `}`.
  const repairedBlock = findBalancedBlock(repair(trimmed));
  if (repairedBlock) candidates.push(repairedBlock);

  let lastError = "no JSON object or array found";
  for (const candidate of candidates) {
    for (const variant of [candidate, repair(candidate)]) {
      try {
        return JSON.parse(variant);
      } catch (error) {
        lastError = (error as Error).message;
      }
    }
  }
  throw new JsonExtractError(`Could not parse JSON from reply (${lastError}). Reply with JSON only.`);
}

/** First balanced {...} or [...] block, respecting strings. */
export function findBalancedBlock(text: string): string | null {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") {
      if (stack.length === 0) start = i;
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      if (stack.length === 0) continue;
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const isSmartDouble = (ch: string) =>
  ch === "\u201C" || ch === "\u201D" || ch === "\u201E" || ch === "\u201F";

function repair(text: string): string {
  const s = text.replace(/^\uFEFF/, "");
  let out = "";
  let inString = false;
  let escaped = false;
  /** False when the current string was opened by a smart double quote (so a smart quote also closes it). */
  let asciiOpener = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        out += ch;
        continue;
      }
      const closes = asciiOpener ? ch === '"' : ch === '"' || isSmartDouble(ch);
      if (closes) {
        inString = false;
        out += '"';
      } else {
        out += ch;
      }
      continue;
    }
    if (ch === '"' || isSmartDouble(ch)) {
      inString = true;
      asciiOpener = ch === '"';
      out += '"';
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}
