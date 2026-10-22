import { CardSchema, DAYS, GUESS_PREFIX, type Card, type Day } from "./schemas";

/** "Unicorn Mafia!" -> "unicorn-mafia". Used for community ids. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "community";
}

export function isGuess(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(GUESS_PREFIX);
}

const DAY_ALIASES: Record<string, Day> = {
  mon: "Mon", monday: "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue",
  wed: "Wed", weds: "Wed", wednesday: "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
  fri: "Fri", friday: "Fri",
  sat: "Sat", saturday: "Sat",
  sun: "Sun", sunday: "Sun",
};

/** Accepts "Monday", "mon", "weekends", "weekdays"; returns unique days in week order. */
export function normaliseDays(input: unknown): Day[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,/;&]|\band\b/) : [];
  const found = new Set<Day>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase().replace(/[^a-z]/g, "");
    if (key === "weekend" || key === "weekends") ["Sat", "Sun"].forEach((d) => found.add(d as Day));
    else if (key === "weekday" || key === "weekdays") ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((d) => found.add(d as Day));
    else if (DAY_ALIASES[key]) found.add(DAY_ALIASES[key]);
  }
  return DAYS.filter((d) => found.has(d));
}

const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && !/^(null|n\/a|unknown|none)$/i.test(t) ? t : null;
};

const strList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(str).filter((s): s is string => s !== null);

const positiveInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Coerces loosely-shaped card JSON (as an LLM may return it) into a valid Card.
 * Unknown values become null or [], days are normalised, and the id is derived in code
 * (never trusted from the model). Throws if the result still fails CardSchema.
 */
export function normaliseCard(raw: unknown, opts: { id?: string; fallbackName?: string; sourceUrls?: string[] } = {}): Card {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const constraints = (obj.constraints && typeof obj.constraints === "object" ? obj.constraints : {}) as Record<string, unknown>;
  const name = str(obj.name) ?? opts.fallbackName ?? "Unnamed community";
  const runs = (Array.isArray(obj.runs) ? obj.runs : [])
    .map((r) => {
      if (typeof r === "string") return str(r) ? { event: r.trim(), frequency: null } : null;
      const rec = (r ?? {}) as Record<string, unknown>;
      const event = str(rec.event) ?? str(rec.name);
      return event ? { event, frequency: str(rec.frequency) } : null;
    })
    .filter((r): r is { event: string; frequency: string | null } => r !== null);
  const sourceUrls = [...new Set([...strList(obj.sourceUrls), ...(opts.sourceUrls ?? [])])];
  return CardSchema.parse({
    id: opts.id ?? slugify(name),
    name,
    tagline: str(obj.tagline),
    location: str(obj.location),
    members: str(obj.members),
    runs,
    offers: strList(obj.offers),
    needs: strList(obj.needs),
    constraints: {
      days: normaliseDays(constraints.days),
      maxGroupSize: positiveInt(constraints.maxGroupSize),
      notes: str(constraints.notes),
    },
    tone: str(obj.tone),
    sourceUrls,
  });
}

/** Compact JSON of a card for prompts (no whitespace noise). */
export function cardToPromptJson(card: Card): string {
  return JSON.stringify(card);
}
