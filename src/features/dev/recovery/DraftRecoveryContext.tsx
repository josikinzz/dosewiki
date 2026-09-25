"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";

import {
  clearDraftRecovery,
  createDraftRecoveryStore,
  recoveryActorKey,
  type DraftRecoveryStore,
} from "./draftRecovery";

const DraftRecoveryContext = createContext<DraftRecoveryStore | null>(null);

/**
 * Hands the signed-in account's checkpoint store to every tool below. Without
 * an account (signed out, the session still resolving, a tool rendered alone)
 * there is no store, and tools keep no recovery copy at all.
 *
 * When an account arrives, every other account's checkpoints on this browser
 * are removed, so a shared machine never offers one person's drafts to the
 * next, even for a moment.
 */
export function DraftRecoveryProvider({ actor, children }: { actor: string | null | undefined; children: ReactNode }) {
  const actorKey = recoveryActorKey(actor);
  useEffect(() => {
    if (actorKey) clearDraftRecovery({ keepActor: actorKey });
  }, [actorKey]);
  const store = useMemo(() => (actorKey ? createDraftRecoveryStore(actorKey) : null), [actorKey]);
  return <DraftRecoveryContext.Provider value={store}>{children}</DraftRecoveryContext.Provider>;
}

/**
 * The provider for the /dev shell, keyed by the session's account. A session
 * that is still loading, or that blinked out on a refetch, has no actor: the
 * store goes away without clearing anything, and comes back with it.
 */
export function SessionDraftRecoveryProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const actor = session.status === "authenticated"
    ? session.data?.user?.email ?? session.data?.user?.id ?? null
    : null;
  return <DraftRecoveryProvider actor={actor}>{children}</DraftRecoveryProvider>;
}

/** The signed-in account's checkpoint store, or `null` when there is none. */
export function useDraftRecoveryStore(): DraftRecoveryStore | null {
  return useContext(DraftRecoveryContext);
}
