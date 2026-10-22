import type { Deal } from "@community-bots/core";
import type { ApprovalView, Run } from "../data/types";
import { shortDate } from "./format";

/** Absolute URL inside this app, respecting the Vite base path. */
export function appUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${base}${p}`;
}

/** Phone approval link. Falls back to this app's own /r/:token page when no phone app is configured. */
export function phoneLink(token: string): string {
  const base = import.meta.env.VITE_PHONE_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/r/${token}` : appUrl(`/r/${token}`);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

const STATUS_WORD: Record<ApprovalView["status"], string> = {
  pending: "waiting",
  approved: "approved",
  declined: "declined",
  renegotiate: "asked for changes",
};

/** A short status update to paste into WhatsApp or Slack. */
export function shareUpdateText(input: {
  run: Pick<Run, "need" | "round" | "status">;
  deal: Deal | null;
  approvals: Pick<ApprovalView, "name" | "status">[];
  link: string;
}): string {
  const { run, deal, approvals, link } = input;
  const lines: string[] = [];
  if (deal) {
    lines.push(`Collab update: ${deal.title}`);
    lines.push(`${shortDate(deal.date)} ${deal.time} · ${deal.venue} · up to ${deal.capacity} people`);
  } else {
    lines.push(`Collab update: ${run.need}`);
  }
  const state =
    run.status === "confirmed"
      ? "Confirmed by everyone."
      : run.status === "declined"
        ? "Declined."
        : run.status === "pending_approval"
          ? `Round ${run.round} is out for approval.`
          : `Bots are negotiating (round ${run.round}).`;
  lines.push(state);
  if (approvals.length && run.status !== "confirmed") {
    lines.push(approvals.map((a) => `${a.name}: ${STATUS_WORD[a.status]}`).join(" · "));
  }
  lines.push(link);
  return lines.join("\n");
}
