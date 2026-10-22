/**
 * Identity without accounts: an organiser link (?inbox=<uuid>) saved to localStorage.
 * Several links can be saved; one is active ("You are <community>").
 */

export interface Identity {
  inbox: string;
  communityId: string | null;
  name: string | null;
  addedAt: string;
}

export interface IdentityState {
  identities: Identity[];
  activeInbox: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const IDENTITY_KEY = "cb.identity.v1";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMUNITY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EMPTY_IDENTITY: IdentityState = { identities: [], activeInbox: null };

/** Accepts a bare uuid, "inbox=<uuid>", or any URL carrying ?inbox=<uuid> (and optional &c=<community id>). */
export function parseInbox(input: string): { inbox: string; communityId: string | null } | null {
  const text = input.trim();
  if (!text) return null;
  if (UUID_RE.test(text)) return { inbox: text.toLowerCase(), communityId: null };
  let params: URLSearchParams | null = null;
  try {
    params = new URL(text).searchParams;
  } catch {
    const query = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
    params = new URLSearchParams(query);
  }
  const inbox = params.get("inbox")?.trim();
  if (!inbox || !UUID_RE.test(inbox)) return null;
  const c = params.get("c")?.trim() ?? null;
  return { inbox: inbox.toLowerCase(), communityId: c && COMMUNITY_RE.test(c) ? c : null };
}

export function loadIdentityState(storage: StorageLike | null): IdentityState {
  if (!storage) return EMPTY_IDENTITY;
  try {
    const raw = storage.getItem(IDENTITY_KEY);
    if (!raw) return EMPTY_IDENTITY;
    const parsed = JSON.parse(raw) as Partial<IdentityState>;
    const identities = Array.isArray(parsed.identities)
      ? parsed.identities.filter((i): i is Identity => !!i && typeof i.inbox === "string" && UUID_RE.test(i.inbox))
      : [];
    const active = typeof parsed.activeInbox === "string" && identities.some((i) => i.inbox === parsed.activeInbox) ? parsed.activeInbox : null;
    return { identities, activeInbox: active ?? identities[0]?.inbox ?? null };
  } catch {
    return EMPTY_IDENTITY;
  }
}

export function saveIdentityState(storage: StorageLike | null, state: IdentityState): void {
  if (!storage) return;
  try {
    storage.setItem(IDENTITY_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: identity lasts for this page only */
  }
}

/** Adds (or refreshes) an identity and makes it active. Known names are never erased by unknown ones. */
export function addIdentity(
  state: IdentityState,
  input: { inbox: string; communityId?: string | null; name?: string | null },
  now: Date = new Date(),
): IdentityState {
  const inbox = input.inbox.toLowerCase();
  const existing = state.identities.find((i) => i.inbox === inbox);
  const next: Identity = {
    inbox,
    communityId: input.communityId ?? existing?.communityId ?? null,
    name: input.name ?? existing?.name ?? null,
    addedAt: existing?.addedAt ?? now.toISOString(),
  };
  return {
    identities: [next, ...state.identities.filter((i) => i.inbox !== inbox)],
    activeInbox: inbox,
  };
}

export function updateIdentity(state: IdentityState, inbox: string, patch: { communityId?: string | null; name?: string | null }): IdentityState {
  let changed = false;
  const identities = state.identities.map((i) => {
    if (i.inbox !== inbox) return i;
    const next = { ...i, communityId: patch.communityId ?? i.communityId, name: patch.name ?? i.name };
    if (next.communityId !== i.communityId || next.name !== i.name) changed = true;
    return next;
  });
  return changed ? { ...state, identities } : state;
}

export function setActiveIdentity(state: IdentityState, inbox: string | null): IdentityState {
  if (inbox === null) return { ...state, activeInbox: null };
  if (!state.identities.some((i) => i.inbox === inbox)) return state;
  return { ...state, activeInbox: inbox };
}

export function removeIdentity(state: IdentityState, inbox: string): IdentityState {
  const identities = state.identities.filter((i) => i.inbox !== inbox);
  const activeInbox = state.activeInbox === inbox ? (identities[0]?.inbox ?? null) : state.activeInbox;
  return { identities, activeInbox };
}

export function activeIdentity(state: IdentityState): Identity | null {
  return state.identities.find((i) => i.inbox === state.activeInbox) ?? null;
}

/** The organiser link to share. `c` is only a display hint; the inbox token is the secret. */
export function organiserLink(baseUrl: string, inbox: string, communityId?: string | null): string {
  const url = new URL(baseUrl);
  url.searchParams.set("inbox", inbox);
  if (communityId) url.searchParams.set("c", communityId);
  return url.toString();
}

/** Removes ?inbox and ?c from a query string, returning what was found. */
export function consumeInboxParam(search: string): { found: { inbox: string; communityId: string | null } | null; rest: string } {
  const params = new URLSearchParams(search);
  const found = params.has("inbox") ? parseInbox(`?${params.toString()}`) : null;
  params.delete("inbox");
  params.delete("c");
  const rest = params.toString();
  return { found, rest: rest ? `?${rest}` : "" };
}
