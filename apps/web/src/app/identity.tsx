import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../components/ui/Toast";
import { useData } from "../data/DataProvider";
import {
  activeIdentity,
  addIdentity,
  consumeInboxParam,
  loadIdentityState,
  organiserLink,
  parseInbox,
  removeIdentity,
  saveIdentityState,
  setActiveIdentity,
  updateIdentity,
  type Identity,
  type IdentityState,
  type StorageLike,
} from "../lib/identity";
import { appUrl } from "../lib/share";

interface IdentityValue {
  identities: Identity[];
  active: Identity | null;
  /** Community ids of every saved organiser link (the people using this browser). */
  communityIds: string[];
  /** Saves an organiser link pasted by the user. Returns an error message, or null on success. */
  addFromLink: (input: string) => Promise<string | null>;
  addKnown: (input: { inbox: string; communityId: string; name: string }) => void;
  switchTo: (inbox: string) => void;
  forget: (inbox: string) => void;
  linkFor: (identity: Pick<Identity, "inbox" | "communityId">) => string;
}

const IdentityContext = createContext<IdentityValue | null>(null);

function storage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const source = useData();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<IdentityState>(() => {
    let next = loadIdentityState(storage());
    const sample = source.sampleIdentity();
    if (sample && next.identities.length === 0) next = addIdentity(next, sample);
    return next;
  });
  const resolving = useRef(new Set<string>());

  useEffect(() => saveIdentityState(storage(), state), [state]);

  const communityIds = useMemo(() => state.identities.map((i) => i.communityId).filter((id): id is string => !!id), [state.identities]);

  useEffect(() => {
    source.setViewer(communityIds);
  }, [source, communityIds]);

  // Fill in names for links we only know by token.
  useEffect(() => {
    for (const identity of state.identities) {
      if (identity.name || resolving.current.has(identity.inbox)) continue;
      resolving.current.add(identity.inbox);
      source
        .resolveInbox(identity.inbox)
        .then((found) => {
          if (found) setState((s) => updateIdentity(s, identity.inbox, { communityId: found.communityId, name: found.name }));
        })
        .catch(() => {
          resolving.current.delete(identity.inbox);
        });
    }
  }, [source, state.identities]);

  // ?inbox=<uuid> in the address bar: save it, then clean the URL.
  useEffect(() => {
    if (!location.search.includes("inbox=")) return;
    const { found, rest } = consumeInboxParam(location.search);
    navigate({ pathname: location.pathname, search: rest, hash: location.hash }, { replace: true });
    if (!found) {
      toast({ title: "That organiser link is not valid", tone: "bad" });
      return;
    }
    setState((s) => addIdentity(s, { inbox: found.inbox, communityId: found.communityId }));
    source
      .resolveInbox(found.inbox)
      .then((who) => {
        if (who) setState((s) => updateIdentity(s, found.inbox, { communityId: who.communityId, name: who.name }));
        toast({ title: "Organiser link saved", body: who ? `You are ${who.name}.` : "This browser now acts as that organiser.", tone: "ok" });
      })
      .catch(() => toast({ title: "Organiser link saved", tone: "ok" }));
  }, [location.search, location.pathname, location.hash, navigate, source, toast]);

  const addFromLink = useCallback(
    async (input: string) => {
      const parsed = parseInbox(input);
      if (!parsed) return "Paste the organiser link you were given. It contains ?inbox= followed by a long code.";
      let who: { communityId: string; name: string } | null = null;
      try {
        who = await source.resolveInbox(parsed.inbox);
      } catch {
        who = null;
      }
      setState((s) => addIdentity(s, { inbox: parsed.inbox, communityId: who?.communityId ?? parsed.communityId, name: who?.name ?? null }));
      toast({ title: "Organiser link saved", body: who ? `You are ${who.name}.` : undefined, tone: "ok" });
      return null;
    },
    [source, toast],
  );

  const addKnown = useCallback((input: { inbox: string; communityId: string; name: string }) => {
    setState((s) => addIdentity(s, input));
  }, []);

  const value = useMemo<IdentityValue>(
    () => ({
      identities: state.identities,
      active: activeIdentity(state),
      communityIds,
      addFromLink,
      addKnown,
      switchTo: (inbox) => setState((s) => setActiveIdentity(s, inbox)),
      forget: (inbox) => setState((s) => removeIdentity(s, inbox)),
      linkFor: (identity) => organiserLink(appUrl("/board"), identity.inbox, identity.communityId),
    }),
    [state, communityIds, addFromLink, addKnown],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used inside IdentityProvider");
  return ctx;
}
