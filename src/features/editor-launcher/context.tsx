"use client";

import { createContext } from "react";

export type EditorTarget =
  | { kind: "substance"; slug: string; name: string }
  | { kind: "effect"; slug: string; name: string }
  | { kind: "writing"; slug: string; name: string; writingKind: "article" | "blog" }
  | { kind: "replications"; slug: string; name: string }
  | { kind: "generic"; name?: string };

export type TargetRegistration = {
  target: EditorTarget;
  pathname: string;
  priority: "page" | "overlay";
};

export const EditorTargetContext = createContext<
  ((registration: TargetRegistration) => () => void) | null
>(null);

export const EditorLauncherEligibilityContext = createContext(false);

export const EditorLauncherOutletContext = createContext<
  ((element: HTMLDivElement) => () => void) | null
>(null);
