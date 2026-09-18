"use client";

import { createContext, useContext } from "react";
import type { AppRole } from "@/lib/auth/roles";

export type DraftNavigationGuard = {
  save?: () => Promise<void>;
  discard: () => void;
  canDiscard?: boolean;
};

export type ContextualEditingState = {
  enabled: boolean;
  mode: "view" | "edit";
  role: AppRole | null;
  email: string | null;
  setDirty: (key: string, dirty: boolean) => void;
  registerDraftGuard: (key: string, guard: DraftNavigationGuard) => () => void;
};

export const ContextualEditingContext = createContext<ContextualEditingState>({
  enabled: false,
  mode: "view",
  role: null,
  email: null,
  setDirty: () => {},
  registerDraftGuard: () => () => {},
});

export const ContextualEditorContainerContext = createContext<HTMLElement | null>(null);

export function useContextualEditing(): ContextualEditingState {
  return useContext(ContextualEditingContext);
}
