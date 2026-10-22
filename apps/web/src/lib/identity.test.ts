import { describe, expect, it } from "vitest";
import {
  activeIdentity,
  addIdentity,
  consumeInboxParam,
  EMPTY_IDENTITY,
  IDENTITY_KEY,
  loadIdentityState,
  organiserLink,
  parseInbox,
  removeIdentity,
  saveIdentityState,
  setActiveIdentity,
  updateIdentity,
  type StorageLike,
} from "./identity";

const A = "0b7e8c1a-2f4d-4c3a-9a51-7d2e1f0c9b11";
const B = "5c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("organiser link parsing", () => {
  it("accepts a bare uuid, a full link and a query string", () => {
    expect(parseInbox(A)).toEqual({ inbox: A, communityId: null });
    expect(parseInbox(`https://bots.example/?inbox=${A}&c=alpha-guild`)).toEqual({ inbox: A, communityId: "alpha-guild" });
    expect(parseInbox(`?inbox=${A.toUpperCase()}`)).toEqual({ inbox: A, communityId: null });
    expect(parseInbox(`  ${A}  `)?.inbox).toBe(A);
  });

  it("rejects anything that is not an organiser link", () => {
    expect(parseInbox("")).toBeNull();
    expect(parseInbox("hello")).toBeNull();
    expect(parseInbox("https://bots.example/?inbox=123")).toBeNull();
    expect(parseInbox(`https://bots.example/?inbox=${A}&c=Not%20Kebab`)?.communityId).toBeNull();
  });

  it("builds a link that parses back", () => {
    const link = organiserLink("https://bots.example/app/", A, "alpha-guild");
    expect(parseInbox(link)).toEqual({ inbox: A, communityId: "alpha-guild" });
  });

  it("removes inbox params from the address bar query", () => {
    expect(consumeInboxParam(`?inbox=${A}&c=alpha-guild&present=1`)).toEqual({
      found: { inbox: A, communityId: "alpha-guild" },
      rest: "?present=1",
    });
    expect(consumeInboxParam("?sample=1")).toEqual({ found: null, rest: "?sample=1" });
  });
});

describe("identity state", () => {
  it("adds, dedupes, switches and forgets identities", () => {
    let state = addIdentity(EMPTY_IDENTITY, { inbox: A, communityId: "alpha-guild", name: "Alpha Guild" });
    state = addIdentity(state, { inbox: B });
    expect(state.identities.map((i) => i.inbox)).toEqual([B, A]);
    expect(activeIdentity(state)?.inbox).toBe(B);

    state = addIdentity(state, { inbox: A, name: null });
    expect(state.identities).toHaveLength(2);
    expect(activeIdentity(state)?.name).toBe("Alpha Guild");

    state = updateIdentity(state, B, { communityId: "beta-circle", name: "Beta Circle" });
    state = setActiveIdentity(state, B);
    expect(activeIdentity(state)?.name).toBe("Beta Circle");
    expect(setActiveIdentity(state, "unknown")).toBe(state);

    state = removeIdentity(state, B);
    expect(activeIdentity(state)?.inbox).toBe(A);
    state = removeIdentity(state, A);
    expect(activeIdentity(state)).toBeNull();
  });

  it("round-trips through storage and survives junk", () => {
    const storage = memoryStorage();
    const state = addIdentity(EMPTY_IDENTITY, { inbox: A, communityId: "alpha-guild", name: "Alpha Guild" });
    saveIdentityState(storage, state);
    expect(loadIdentityState(storage)).toEqual(state);

    storage.setItem(IDENTITY_KEY, "{not json");
    expect(loadIdentityState(storage)).toEqual(EMPTY_IDENTITY);
    storage.setItem(IDENTITY_KEY, JSON.stringify({ identities: [{ inbox: "bad" }, { inbox: B, communityId: null, name: null, addedAt: "" }], activeInbox: "gone" }));
    const loaded = loadIdentityState(storage);
    expect(loaded.identities.map((i) => i.inbox)).toEqual([B]);
    expect(loaded.activeInbox).toBe(B);
    expect(loadIdentityState(null)).toEqual(EMPTY_IDENTITY);
  });
});
