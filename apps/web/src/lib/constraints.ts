import { dayOfWeek, isValidIsoDate, todayIso, type Card, type Day, type Deal } from "@community-bots/core";

export interface ConstraintCheck {
  id: string;
  kind: "date" | "day" | "capacity";
  communityId: string | null;
  /** True when the deal satisfies the rule (or the card sets no limit). */
  ok: boolean;
  /** True when the card says nothing, so the rule cannot fail. */
  unknown: boolean;
  label: string;
}

export const DAY_NAMES: Record<Day, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export function listDays(days: Day[]): string {
  if (days.length === 0) return "any day";
  return days.join(", ");
}

/**
 * Live checks of a deal against the cards, computed in the browser:
 * the date is after today, its weekday is allowed by every community, and the
 * capacity fits every maxGroupSize that is set.
 */
export function checkDealConstraints(
  deal: Deal,
  cards: Record<string, Card | undefined>,
  now: Date = new Date(),
): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];
  const validDate = isValidIsoDate(deal.date);
  const today = todayIso(now);
  checks.push({
    id: "date",
    kind: "date",
    communityId: null,
    ok: validDate && deal.date > today,
    unknown: false,
    label: !validDate ? `${deal.date} is not a real date` : deal.date > today ? "Date is in the future" : "Date has already passed",
  });

  const weekday = validDate ? dayOfWeek(deal.date) : null;
  for (const community of deal.communities) {
    const card = cards[community.id];
    const name = card?.name ?? community.name;
    if (!card) {
      checks.push({ id: `day:${community.id}`, kind: "day", communityId: community.id, ok: true, unknown: true, label: `No card loaded for ${name}` });
      continue;
    }
    const days = card.constraints.days;
    if (weekday) {
      if (days.length === 0) {
        checks.push({ id: `day:${community.id}`, kind: "day", communityId: community.id, ok: true, unknown: true, label: `${name} lists no day limits` });
      } else if (days.includes(weekday)) {
        checks.push({ id: `day:${community.id}`, kind: "day", communityId: community.id, ok: true, unknown: false, label: `${DAY_NAMES[weekday]} works for ${name}` });
      } else {
        checks.push({
          id: `day:${community.id}`,
          kind: "day",
          communityId: community.id,
          ok: false,
          unknown: false,
          label: `${DAY_NAMES[weekday]} is not a day ${name} can do (${listDays(days)})`,
        });
      }
    }

    const max = card.constraints.maxGroupSize;
    if (max === null) {
      checks.push({ id: `cap:${community.id}`, kind: "capacity", communityId: community.id, ok: true, unknown: true, label: `${name} lists no size limit` });
    } else if (deal.capacity <= max) {
      checks.push({ id: `cap:${community.id}`, kind: "capacity", communityId: community.id, ok: true, unknown: false, label: `${deal.capacity} people fits ${name}'s max of ${max}` });
    } else {
      checks.push({ id: `cap:${community.id}`, kind: "capacity", communityId: community.id, ok: false, unknown: false, label: `${deal.capacity} people is over ${name}'s max of ${max}` });
    }
  }
  return checks;
}

export function allChecksPass(checks: ConstraintCheck[]): boolean {
  return checks.every((c) => c.ok);
}
