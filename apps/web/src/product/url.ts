import { COMMUNITY_ID_RE } from "@community-bots/core";
import { UUID_RE } from "../lib/identity";

export function withPresent(path: string, present: boolean): string {
  if (!present) return path;
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const base = hashAt >= 0 ? path.slice(0, hashAt) : path;
  if (/[?&]present=1(?:&|$)/.test(base)) return path;
  const next = base.includes("?") ? `${base}&present=1` : `${base}?present=1`;
  return `${next}${hash}`;
}

export function repoUrl(): string | null {
  const value = import.meta.env.VITE_REPO_URL?.trim();
  return value || null;
}

export function eventPageUrl(dealId: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const path = `${base}/event/${dealId}`;
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isUuid(value: string | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

export function isCommunityId(value: string | undefined): value is string {
  return !!value && COMMUNITY_ID_RE.test(value);
}
