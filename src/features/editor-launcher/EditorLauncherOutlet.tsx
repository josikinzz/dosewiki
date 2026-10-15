"use client";

import { useContext, useEffect, useRef } from "react";
import { EditorLauncherOutletContext } from "./context";

export function EditorLauncherOutlet() {
  const register = useContext(EditorLauncherOutletContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && register) return register(ref.current);
  }, [register]);
  return <div ref={ref} className="contents" />;
}
