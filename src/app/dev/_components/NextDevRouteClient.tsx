"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConvexProvider as BaseConvexProvider, ConvexReactClient } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { convex as sharedConvexClient, getConvexUrl } from "@/lib/convex";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { getEmptyEditorLibrary } from "@/data/emptyLibrary";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { DevModePage } from "@/features/dev/pages/DevModePage";
import { tabNeedsLibrary } from "@/features/dev/pages/devModePageUtils";
import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";
import { parsePath, viewToPath } from "@/utils/routing";
import { useOwnedProfileKey } from "./useOwnedProfileKey";

type NextDevRouteClientProps = {
  convexUrl: string | null;
  initialTab: DevModeTab;
  initialSlug?: string;
  initialFilter?: string;
  initialProfileKey?: string;
  /**
   * The canonical contributor key for the signed-in editor, resolved through a
   * privileged Convex read that must stay on the server. It arrives as an
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
  // Only the corpus-backed tools drain the editor projection, and once a
  // session has drained it the library stays mounted: navigating from the
  // article editor to a non-library tool must not throw away unsaved edits
  // held in `DevModeProvider`, which is fed from this library.
  const needsLibrary = useLibraryLatch(tabNeedsLibrary(routeState.tab));
  const { library, isLoading: isLoadingLibrary } = useLazyLibrary(needsLibrary);

  // Nothing gates the shell. The tab rail paints on the first client render;
  // the corpus drain lands behind it, and the tools that need it show their
  // own loading state instead of holding the chrome back.
  return (
    <SubstanceIndexProvider libraryData={library ?? getEmptyEditorLibrary()}>
      <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath}>
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
  convexUrl,
  initialTab,
  initialSlug,
  initialFilter,
  initialProfileKey,
  ownedProfileKey,
}: NextDevRouteClientProps) {
  // The dev shell receives its Convex URL from the server (editor browser-read
  // target, which can come from VITE_CONVEX_URL in server env), so it must win
  // over the browser-resolved default client. Reuse the shared client from
  // @/lib/convex when the URLs agree so the dev tree never opens a second
  // Convex connection; only construct a dedicated client when the browser
  // default is missing or points elsewhere. React Query and the auth session
  // come from the layout-level AppProviders — do not remount them here.
  const convexClient = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    if (sharedConvexClient && getConvexUrl() === convexUrl) {
      return sharedConvexClient;
    }
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);
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

  if (!convexClient) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Convex is not configured</div>
        <div className="theme-text-muted text-sm">Set `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL` for the Next `/dev` shell.</div>
      </div>
    );
  }

  return (
    <BaseConvexProvider client={convexClient}>
      <NextDevDataLoader
        routeState={routeState}
        initialProfileKey={profileKey}
        onTabChange={handleTabChange}
        navigate={handleNavigate}
        getCurrentPath={readCurrentPath}
      />
    </BaseConvexProvider>
  );
}
