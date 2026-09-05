"use client";

import {
  lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { getEditorHandoffUrl, isEditorHost } from "@server/next/publicHostPolicy";
import {
  EditorLauncherEligibilityContext, EditorLauncherOutletContext, EditorTargetContext,
  type TargetRegistration,
} from "./context";

const EditorLauncherSession = lazy(() => import("./EditorLauncherSession"));

export function EditorLauncherProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [editorHost, setEditorHost] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [targets, setTargets] = useState<TargetRegistration[]>([]);
  const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
  const reading = getEditorHandoffUrl(pathname, "", true) === null;
  const enabled = editorHost && reading;

  useEffect(() => {
    setEditorHost(SITE_FLAVOR === "dosewiki" && isEditorHost(window.location.hostname));
  }, []);

  const register = useCallback((entry: TargetRegistration) => {
    setTargets((current) => [...current, entry]);
    return () => setTargets((current) => current.filter((item) => item !== entry));
  }, []);
  const registerOutlet = useCallback((element: HTMLDivElement) => {
    setOutlet(element);
    return () => setOutlet((current) => current === element ? null : current);
  }, []);
  const target = useMemo(() => {
    let page: TargetRegistration | undefined;
    for (let index = targets.length - 1; index >= 0; index--) {
      const entry = targets[index];
      if (entry.pathname !== pathname) continue;
      if (entry.priority === "overlay") return entry.target;
      page ??= entry;
    }
    return page?.target;
  }, [targets, pathname]);

  return (
    <EditorTargetContext.Provider value={enabled ? register : null}>
      <EditorLauncherOutletContext.Provider value={enabled ? registerOutlet : null}>
        <EditorLauncherEligibilityContext.Provider value={enabled && eligible}>
          {children}
          {enabled ? (
            <Suspense fallback={null}>
              <EditorLauncherSession
                onEligibilityChange={setEligible}
                target={target}
                outlet={outlet}
                pathname={pathname}
              />
            </Suspense>
          ) : null}
        </EditorLauncherEligibilityContext.Provider>
      </EditorLauncherOutletContext.Provider>
    </EditorTargetContext.Provider>
  );
}
