"use client";

import { useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { EditorTargetContext, type EditorTarget } from "./context";

export function EditorLauncherTarget({
  target,
  priority = "page",
}: {
  target: EditorTarget;
  priority?: "page" | "overlay";
}) {
  const register = useContext(EditorTargetContext);
  const pathname = usePathname();
  const { kind, name } = target;
  const slug = target.kind === "generic" ? undefined : target.slug;
  const writingKind = target.kind === "writing" ? target.writingKind : undefined;
  const key = JSON.stringify([kind, slug, name, writingKind, priority]);
  const [identity, setIdentity] = useState({ key, pathname });
  if (identity.key !== key) setIdentity({ key, pathname });
  const targetPathname = priority === "overlay" ? pathname : identity.pathname;

  useEffect(() => {
    if (!register) return;
    const current: EditorTarget = kind === "generic"
      ? { kind, name }
      : kind === "writing"
        ? { kind, slug: slug!, name: name!, writingKind: writingKind! }
        : { kind, slug: slug!, name: name! };
    return register({ target: current, pathname: targetPathname, priority });
  }, [register, targetPathname, kind, slug, name, writingKind, priority]);

  return null;
}
