"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { getEmptyEditorLibrary } from "@/data/emptyLibrary";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { DevModePage } from "@/features/dev/pages/DevModePage";
import { LIBRARY_DEPENDENT_TABS } from "@/features/dev/pages/devModePageUtils";
import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";
import { parsePath, viewToPath } from "@/utils/routing";
import { useOwnedProfileKey } from "./useOwnedProfileKey";

type NextDevRouteClientProps = {
  initialTab: DevModeTab;
  initialSlug?: string;
  initialFilter?: string;
  initialProfileKey?: string;
  /**
   * The canonical contributor key for the signed-in editor, resolved through a
   * privileged Postgres read that must stay on the server. It arrives as an
   * unawaited promise so the HTML ships without waiting on it; until it lands
   * the shell runs on the key derived from the session email, which is what
   * that read falls back to anyway.
   */
  ownedProfileKey?: Promise<string | null>;
};

type DevRouteState = {
  tab: DevModeTab;
  slug?: string;
  /** The tab's URL filter value (`?kind=blog`), validated by the registry. */
  filter?: string;
};

/**
 * One-way switch: true the first time a corpus-backed tool is opened, and true
 * forever after within the session. Unsaved article edits live above the tab
 * switch, so unmounting the library on the way to a non-library tool would
 * discard them.
 */
function useLibraryLatch(needsLibraryNow: boolean): boolean {
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    if (needsLibraryNow) {
      setLatched(true);
    }
  }, [needsLibraryNow]);

  return needsLibraryNow || latched;
}

/**
 * The route the shell renders, from the client router's pathname and search
 * string. Both are read live so back/forward and the tabs' own
 * `history.replaceState` filter writes land here without a server round trip;
 * the server-resolved `fallback` only covers the first render before the
 * router reports.
 */
export function resolveDevRouteState(
  pathname: string | null,
  search: string | null,
  fallback: DevRouteState,
): DevRouteState {
  if (!pathname) {
    return fallback;
  }

  const parsed = parsePath(search ? `${pathname}?${search}` : pathname, fallback.slug ?? null, {
    type: "dev",
    tab: fallback.tab,
    slug: fallback.slug,
    filter: fallback.filter,
  });

  if (parsed.type !== "dev") {
    return fallback;
  }

  return {
    tab: parsed.tab,
    slug: parsed.slug,
    filter: parsed.filter,
  };
}

function NextDevDataLoader({ routeState, initialProfileKey, onTabChange, navigate, getCurrentPath }: {
  routeState: DevRouteState;
  initialProfileKey?: string;
  onTabChange: (tab: DevModeTab) => void;
  navigate: (path: string) => void;
  getCurrentPath: () => string;
}) {
  // Blocking corpus tools and the two late-fill consumers keep their existing
  // behavior. Change Review waits until "Load into editor" is actually used.
  const needsLibrary = useLibraryLatch(
    LIBRARY_DEPENDENT_TABS.has(routeState.tab)
    || routeState.tab === "tag-editor",
  );
  const { library, isLoading: isLoadingLibrary, requestLibrary } = useLazyLibrary(needsLibrary);

  // Nothing gates the shell. The tab rail paints on the first client render;
  // the corpus drain lands behind it, and the tools that need it show their
  // own loading state instead of holding the chrome back.
  return (
    <SubstanceIndexProvider libraryData={library ?? getEmptyEditorLibrary()}>
      <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath} requestLibrary={requestLibrary}>
        <DevModePage
          activeTab={routeState.tab}
          initialArticleSlug={routeState.slug}
          initialFilter={routeState.filter}
          initialProfileKey={initialProfileKey}
          isLibraryLoading={isLoadingLibrary || !library}
          onTabChange={onTabChange}
        />
      </DevModeProvider>
    </SubstanceIndexProvider>
  );
}

export function NextDevRouteClient({
  initialTab,
  initialSlug,
  initialFilter,
  initialProfileKey,
  ownedProfileKey,
}: NextDevRouteClientProps) {
  // Every read the shell makes goes through the `/api/editor/*` routes on the
  // TanStack Query client mounted by the layout-level AppProviders, alongside
  // the auth session; nothing is remounted here and no data-backend client
  // exists in the browser.
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const fallbackRouteState = useMemo<DevRouteState>(() => ({
    tab: initialTab,
    slug: initialSlug,
    filter: initialFilter,
  }), [initialFilter, initialSlug, initialTab]);
  const routeState = useMemo(
    () => resolveDevRouteState(pathname, search, fallbackRouteState),
    [fallbackRouteState, pathname, search],
  );

  const handleTabChange = useCallback((tab: DevModeTab) => {
    const nextPath = viewToPath({ type: "dev", tab });
    if (pathname !== nextPath) {
      router.push(nextPath);
    }
  }, [pathname, router]);

  const handleNavigate = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  const readCurrentPath = useCallback(() => pathname ?? "/dev", [pathname]);
  const profileKey = useOwnedProfileKey(initialProfileKey, ownedProfileKey);

  return (
    <NextDevDataLoader
      routeState={routeState}
      initialProfileKey={profileKey}
      onTabChange={handleTabChange}
      navigate={handleNavigate}
      getCurrentPath={readCurrentPath}
    />
  );
}
