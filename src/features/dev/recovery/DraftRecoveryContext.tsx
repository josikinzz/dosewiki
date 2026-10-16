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

export function DraftRecoveryProvider({ actor, children }: { actor: string | null | undefined; children: ReactNode }) {
  const actorKey = recoveryActorKey(actor);
  useEffect(() => {
    if (actorKey) clearDraftRecovery({ keepActor: actorKey });
  }, [actorKey]);
  const store = useMemo(() => (actorKey ? createDraftRecoveryStore(actorKey) : null), [actorKey]);
  return <DraftRecoveryContext.Provider value={store}>{children}</DraftRecoveryContext.Provider>;
}

export function SessionDraftRecoveryProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const actor = session.status === "authenticated"
    ? session.data?.user?.email ?? session.data?.user?.id ?? null
    : null;
  return <DraftRecoveryProvider actor={actor}>{children}</DraftRecoveryProvider>;
}

export function useDraftRecoveryStore(): DraftRecoveryStore | null {
  return useContext(DraftRecoveryContext);
}
