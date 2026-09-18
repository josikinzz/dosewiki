"use client";

import { useContext, useEffect, useRef } from "react";
import { EditorLauncherOutletContext } from "./context";

/** Keep the one launcher inside the viewer's modal focus boundary while it is open. */
export function EditorLauncherOutlet() {
  const register = useContext(EditorLauncherOutletContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && register) return register(ref.current);
  }, [register]);
  // A portal target must not consume a grid row in the full-viewport viewer.
  // The launcher positions itself; this wrapper only supplies its DOM parent.
  return <div ref={ref} className="contents" />;
}
