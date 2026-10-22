import { allowedDaysForAll, dayOfWeek, isValidIsoDate, todayIso } from "./dates";
import { verifyEvidence } from "./evidence";
import { DealSchema, formatZodError, type Card, type Deal } from "./schemas";

export interface DealContext {
  /** Cards of every community that took part in the negotiation (lead first). */
  cards: Card[];
  leadId: string;
  /** System clock; injectable for tests. */
  now?: Date;
}

export type DealValidation =
  | { ok: true; deal: Deal; droppedReasons: Deal["reasons"] }
  | { ok: false; errors: string[] };

/**
 * Validates a Scribe deal with zod plus the rules code must enforce:
 * the date is in the future and on a weekday allowed by EVERY involved community,
 * capacity fits every maxGroupSize that is set, only participants are involved,
 * names come from the cards, and reasons whose evidence is not on the card are dropped.
 */
export function validateDeal(raw: unknown, ctx: DealContext): DealValidation {
  const parsed = DealSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: [formatZodError(parsed.error)] };
  const deal = structuredClone(parsed.data);
  const errors: string[] = [];
  const cardsById = new Map(ctx.cards.map((card) => [card.id, card]));

  const ids = deal.communities.map((c) => c.id);
  const unknown = ids.filter((id) => !cardsById.has(id));
  if (unknown.length) errors.push(`communities: unknown id(s) ${unknown.join(", ")}; use only ${[...cardsById.keys()].join(", ")}`);
  if (new Set(ids).size !== ids.length) errors.push("communities: each community may appear only once");
  if (!ids.includes(ctx.leadId)) errors.push(`communities: the lead community ${ctx.leadId} must be included`);
  if (!deal.communities.some((c) => c.role === "host")) errors.push("communities: one community must have role 'host'");

  const involved = deal.communities.map((c) => cardsById.get(c.id)).filter((c): c is Card => Boolean(c));
  for (const community of deal.communities) {
    const card = cardsById.get(community.id);
    if (card) community.name = card.name;
  }

  const today = todayIso(ctx.now ?? new Date());
  if (!isValidIsoDate(deal.date)) {
    errors.push(`date: ${deal.date} is not a real calendar date`);
  } else {
    if (deal.date <= today) errors.push(`date: ${deal.date} must be after today (${today})`);
    const allowed = allowedDaysForAll(involved.map((card) => card.constraints.days));
    const weekday = dayOfWeek(deal.date);
    if (allowed.length === 0) {
      errors.push("date: no weekday is allowed by every involved community; drop a community or pick from the overlap");
    } else if (!allowed.includes(weekday)) {
      const blockers = involved.filter((c) => c.constraints.days.length && !c.constraints.days.includes(weekday));
      errors.push(
        `date: ${deal.date} is a ${weekday}, not allowed by ${blockers.map((c) => c.name).join(", ")}; allowed days for everyone: ${allowed.join(", ")}`,
      );
    }
  }

  for (const card of involved) {
    const max = card.constraints.maxGroupSize;
    if (max !== null && deal.capacity > max) {
      errors.push(`capacity: ${deal.capacity} exceeds ${card.name}'s maxGroupSize of ${max}`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const kept: Deal["reasons"] = [];
  const droppedReasons: Deal["reasons"] = [];
  for (const reason of deal.reasons) {
    const card = cardsById.get(reason.communityId);
    if (card && ids.includes(reason.communityId) && verifyEvidence(reason.evidence, card)) kept.push(reason);
    else droppedReasons.push(reason);
  }
  deal.reasons = kept;
  return { ok: true, deal, droppedReasons };
}
