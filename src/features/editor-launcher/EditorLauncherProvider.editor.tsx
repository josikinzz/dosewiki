"use client";

import {
  lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { getEditorHandoffUrl } from "@server/next/publicHostPolicy";
import { canAccessDev, type AppRole } from "@/lib/auth/roles";
import { useDirtyGuard } from "@/features/dev/components/useDirtyGuard";
import {
  ContextualEditingContext, ContextualEditorContainerContext, type DraftNavigationGuard,
} from "@/features/contextual-editing/context";
import {
  EditorLauncherEligibilityContext, EditorLauncherOutletContext, EditorTargetContext,
  type TargetRegistration,
} from "./context";

const EditorLauncherSession = lazy(() => import("./EditorLauncherSession"));

export function EditorLauncherProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Middleware admits approved editor aliases; the public build substitutes this shell.
  const editorHost = process.env.NEXT_PUBLIC_EDITOR_BUILD === "true" && SITE_FLAVOR === "dosewiki";
  const [identity, setIdentity] = useState<{ role: AppRole | null; email: string | null }>({ role: null, email: null });
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [targets, setTargets] = useState<TargetRegistration[]>([]);
  const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);
  const dirty = useRef(new Set<string>());
  const guards = useRef(new Map<string, DraftNavigationGuard>());
  const [, refreshGuards] = useState(0);
  const reading = getEditorHandoffUrl(pathname, "", true) === null;
  const enabled = editorHost && reading;
  const eligible = enabled && canAccessDev(identity.role);
  const contextualEnabled = eligible && process.env.NEXT_PUBLIC_CONTEXTUAL_EDITING !== "false";

  const onIdentityChange = useCallback((role: AppRole | null, email: string | null) => {
    setIdentity((current) => current.role === role && current.email === email ? current : { role, email });
    if (!canAccessDev(role)) setMode("view");
  }, []);
  const setDirty = useCallback((key: string, value: boolean) => {
    const changed = value ? !dirty.current.has(key) : dirty.current.has(key);
    if (value) dirty.current.add(key);
    else dirty.current.delete(key);
    if (changed) refreshGuards((version) => version + 1);
  }, []);
  const registerDraftGuard = useCallback((key: string, guard: DraftNavigationGuard) => {
    guards.current.set(key, guard);
    refreshGuards((version) => version + 1);
    return () => {
      if (guards.current.get(key) === guard) {
        guards.current.delete(key);
        refreshGuards((version) => version + 1);
      }
    };
  }, []);
  const activeGuards = [...dirty.current].map((key) => guards.current.get(key));
  const { guard: requestLeave, dialog: leaveDialog } = useDirtyGuard(dirty.current.size > 0, {
    title: "Unsaved changes",
    description: activeGuards.every((guard) => guard && guard.canDiscard !== false)
      ? "Save a private draft, discard your changes, or keep editing. Nothing is published by leaving."
      : "Return to the open editor to save, discard, or reconcile its pending publication before leaving.",
    canDiscard: activeGuards.every((guard) => guard && guard.canDiscard !== false),
    container: outlet,
    onDiscard: () => {
      for (const key of dirty.current) guards.current.get(key)?.discard();
      dirty.current.clear();
      refreshGuards((version) => version + 1);
    },
    onSave: activeGuards.length > 0 && activeGuards.every((guard) => guard?.save) ? async () => {
      for (const key of [...dirty.current]) {
        await guards.current.get(key)!.save!();
        dirty.current.delete(key);
      }
      refreshGuards((version) => version + 1);
    } : undefined,
  });
  useEffect(() => {
    const navigation = (event: MouseEvent) => {
      if (!dirty.current.size || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, location.href);
      if (target.pathname === location.pathname && target.search === location.search && target.origin === location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      requestLeave(() => location.assign(target.href));
    };
    document.addEventListener("click", navigation, true);
    return () => {
      document.removeEventListener("click", navigation, true);
    };
  }, [requestLeave]);
  useEffect(() => {
    // Navigation API cancellation happens before a same-document history
    // traversal, unlike popstate which fires after React has lost the page.
    type NavigationEvent = Event & {
      destination: { url: string; key: string };
      navigationType: string;
      hashChange: boolean;
    };
    type BrowserNavigation = EventTarget & { traverseTo: (key: string) => unknown };
    // The installed DOM typings predate this optional browser API.
    const browserWindow = window as unknown as { navigation?: BrowserNavigation };
    const navigation = browserWindow.navigation;
    if (!navigation) return;
    let permittedKey: string | null = null;
    const beforeNavigate = (raw: Event) => {
      const event = raw as NavigationEvent;
      if (event.destination.key === permittedKey) { permittedKey = null; return; }
      if (!dirty.current.size || !event.cancelable || event.hashChange || event.navigationType !== "traverse") return;
      event.preventDefault();
      requestLeave(() => {
        permittedKey = event.destination.key;
        navigation.traverseTo(permittedKey);
      });
    };
    navigation.addEventListener("navigate", beforeNavigate);
    return () => navigation.removeEventListener("navigate", beforeNavigate);
  }, [requestLeave]);
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
  const editing = useMemo(() => ({
    enabled: contextualEnabled, mode: contextualEnabled ? mode : "view" as const,
    role: eligible ? identity.role : null, email: eligible ? identity.email : null,
    setDirty, registerDraftGuard,
  }), [contextualEnabled, eligible, mode, identity, setDirty, registerDraftGuard]);
  return (
    <EditorTargetContext.Provider value={enabled ? register : null}>
      <EditorLauncherOutletContext.Provider value={enabled ? registerOutlet : null}>
        <EditorLauncherEligibilityContext.Provider value={eligible}>
          <ContextualEditingContext.Provider value={editing}>
            <ContextualEditorContainerContext.Provider value={outlet}>
              {children}
              {enabled ? <Suspense fallback={null}>
                <EditorLauncherSession onIdentityChange={onIdentityChange} target={target} outlet={outlet} pathname={pathname}
                  contextualEnabled={contextualEnabled} mode={mode}
                  onModeChange={(next) => next === "edit" ? setMode(next) : requestLeave(() => setMode(next))} />
              </Suspense> : null}
              {leaveDialog}
            </ContextualEditorContainerContext.Provider>
          </ContextualEditingContext.Provider>
        </EditorLauncherEligibilityContext.Provider>
      </EditorLauncherOutletContext.Provider>
    </EditorTargetContext.Provider>
  );
}

