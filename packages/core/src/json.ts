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
  const candidates: string[] = [];
  const trimmed = text.trim();
  candidates.push(trimmed);
  for (const match of trimmed.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) candidates.push(match[1].trim());
  const block = findBalancedBlock(trimmed);
  if (block) candidates.push(block);

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
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function repair(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/^\uFEFF/, "");
}
