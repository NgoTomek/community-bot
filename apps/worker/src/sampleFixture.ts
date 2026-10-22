import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CardSchema,
  addDays,
  allowedDaysForAll,
  formatZodError,
  nextAllowedDate,
  todayIso,
  validateDeal,
  type Card,
  type Deal,
  type Stance,
} from "@community-bots/core";
import { repoRoot } from "./env";

export type SampleFile = {
  communities: { inboxToken: string; card: Card }[];
  run: { id: string; leadId: string; partnerIds: string[]; need: string };
  deal: { id: string; terms: Omit<Deal, "date"> };
  approvalTokens: Record<string, string>;
  messages: {
    speaker: string;
    communityId: string;
    role: "human" | "bot";
    text: string;
    stance: Stance | null;
    quote: string | null;
  }[];
  announcements: Record<string, string>;
};

export function loadSample(): SampleFile {
  const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "supabase/seed/sample.json"), "utf8"));
  const sample = raw as SampleFile;
  for (const entry of sample.communities) {
    const parsed = CardSchema.safeParse(entry.card);
    if (!parsed.success) {
      throw new Error(`Sample card is not valid: ${formatZodError(parsed.error)}`);
    }
    entry.card = parsed.data;
  }
  return sample;
}

/** Next shared weekday at least 14 days ahead. The sample communities overlap on Thursday. */
export function sampleDate(sample: SampleFile, now = new Date()): string {
  const allowed = allowedDaysForAll(sample.communities.map((entry) => entry.card.constraints.days));
  const date = nextAllowedDate(addDays(todayIso(now), 14), allowed);
  if (!date) throw new Error("The sample communities share no weekday");
  return date;
}

export function loadSampleDeal(now = new Date()): { sample: SampleFile; deal: Deal; date: string } {
  const sample = loadSample();
  const date = sampleDate(sample, now);
  const checked = validateDeal(
    { ...sample.deal.terms, date },
    { cards: sample.communities.map((entry) => entry.card), leadId: sample.run.leadId, now },
  );
  if (!checked.ok) throw new Error(checked.errors.join("; "));
  return { sample, deal: checked.deal, date };
}
