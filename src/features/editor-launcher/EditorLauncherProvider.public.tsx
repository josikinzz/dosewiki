import type { ReactNode } from "react";

/** The public artifact has no session provider, editor controls, or editor imports. */
export function EditorLauncherProvider({ children }: { children: ReactNode }) {
  return children;
}

export default EditorLauncherProvider;
