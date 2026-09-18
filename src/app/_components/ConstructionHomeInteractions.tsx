"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ConstructionHomeInteractionValue {
  clickedItem: string | null;
  showComingSoon: (label: string) => void;
}

const ConstructionHomeInteractionContext = createContext<ConstructionHomeInteractionValue | null>(null);

export function ConstructionHomeInteractionProvider({ children }: { children: ReactNode }) {
  const [clickedItem, setClickedItem] = useState<string | null>(null);

  const showComingSoon = (label: string) => {
    setClickedItem(label);
    window.setTimeout(() => setClickedItem((current) => (current === label ? null : current)), 900);
  };

  return (
    <ConstructionHomeInteractionContext.Provider value={{ clickedItem, showComingSoon }}>
      {children}
    </ConstructionHomeInteractionContext.Provider>
  );
}

export function useConstructionHomeInteractions() {
  const interactions = useContext(ConstructionHomeInteractionContext);
  if (!interactions) {
    throw new Error("Construction homepage interactions require their provider");
  }
  return interactions;
}
