import type { Run } from "../../data/types";
import type { StorageLike } from "../../lib/identity";

/**
 * Where an event stands. `allApproved` comes from get_event; the run tells us whether this deal
 * is still the current round (an old round's page must never look confirmed).
 */
export type EventPhase = "draft" | "confirmed" | "renegotiating" | "replaced" | "declined";

export function eventPhase(input: {
  dealId: string;
  allApproved: boolean;
  /** Round of this deal, once known. */
  round: number | null;
  run: Pick<Run, "dealId" | "status" | "round"> | null | undefined;
}): EventPhase {
  const { dealId, allApproved, round, run } = input;
  if (run) {
    if (run.dealId && run.dealId !== dealId) return "replaced";
    if (run.status === "declined") return "declined";
    if (round !== null && run.round > round && run.status !== "confirmed") return "renegotiating";
  }
  return allApproved ? "confirmed" : "draft";
}

export const RSVP_NAME_MAX = 60;

export function rsvpNameError(name: string): string | null {
  const clean = name.trim();
  if (!clean) return "Add your name so the organisers know who is coming.";
  if (clean.length > RSVP_NAME_MAX) return `Keep your name under ${RSVP_NAME_MAX} characters.`;
  return null;
}

export interface SavedRsvp {
  name: string;
  at: string;
}

export const rsvpKey = (dealId: string) => `cb.rsvp.${dealId}`;

/** The RSVP this browser already sent for a deal, if any. */
export function readRsvp(storage: Pick<StorageLike, "getItem"> | null, dealId: string): SavedRsvp | null {
  try {
    const raw = storage?.getItem(rsvpKey(dealId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedRsvp> | null;
    if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    return { name: parsed.name.trim(), at: typeof parsed.at === "string" ? parsed.at : "" };
  } catch {
    return null;
  }
}

export function saveRsvp(storage: Pick<StorageLike, "setItem"> | null, dealId: string, rsvp: SavedRsvp): void {
  try {
    storage?.setItem(rsvpKey(dealId), JSON.stringify(rsvp));
  } catch {
    /* storage full or blocked: the RSVP itself still went through */
  }
}

/** "climate-game-jam.ics" */
export function icsFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug || "event"}.ics`;
}

/** What gets pasted into a community chat: the Bot's announcement plus the RSVP link. */
export function announcementCopy(text: string, url: string): string {
  return `${text.trim()}\n${url}`;
}
