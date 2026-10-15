"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { getEmptyEditorLibrary } from "@/data/emptyLibrary";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { DevModePage } from "@/features/dev/pages/DevModePage";
import { tabNeedsLibrary } from "@/features/dev/pages/devModePageUtils";
import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";
import { parsePath, viewToPath } from "@/utils/routing";
import { setEditorLegacyContributorHandleGroups } from "@server/contributorProfileIdentity";
import { useOwnedProfileKey } from "./useOwnedProfileKey";

type NextDevRouteClientProps = {
  initialTab: DevModeTab;
  initialSlug?: string;
  initialFilter?: string;
  initialProfileKey?: string;
  ownedProfileKey?: Promise<string | null>;
  legacyHandleGroups?: string;
};

type DevRouteState = {
  tab: DevModeTab;
  slug?: string;
  filter?: string;
};

function comparableAddress(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function useLibraryLatch(needsLibraryNow: boolean): boolean {
  const [latched, setLatched] = useState(false);

  useEffect(() => {
    if (needsLibraryNow) {
      setLatched(true);
    }
  }, [needsLibraryNow]);

  return needsLibraryNow || latched;
}

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

function NextDevDataLoader({ routeState, initialProfileKey, onTabChange, onOpenPath, toolMountKey, navigate, getCurrentPath }: {
  routeState: DevRouteState;
  initialProfileKey?: string;
  onTabChange: (tab: DevModeTab) => void;
  onOpenPath: (path: string) => void;
  toolMountKey: number;
  navigate: (path: string) => void;
  getCurrentPath: () => string;
}) {
  const needsLibrary = useLibraryLatch(tabNeedsLibrary(routeState.tab));
  const { library, isLoading: isLoadingLibrary, requestLibrary, error: libraryError } = useLazyLibrary(needsLibrary);

  return (
    <SubstanceIndexProvider libraryData={library ?? getEmptyEditorLibrary()}>
      <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath} requestLibrary={requestLibrary}>
        <DevModePage
          activeTab={routeState.tab}
          initialArticleSlug={routeState.slug}
          initialFilter={routeState.filter}
          initialProfileKey={initialProfileKey}
          isLibraryLoading={isLoadingLibrary || !library}
          libraryError={library ? null : libraryError ?? null}
          onRetryLibrary={() => { void requestLibrary().catch(() => {}); }}
          onTabChange={onTabChange}
          onOpenPath={onOpenPath}
          toolMountKey={toolMountKey}
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
  legacyHandleGroups,
}: NextDevRouteClientProps) {
  setEditorLegacyContributorHandleGroups(legacyHandleGroups);
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

  const address = comparableAddress(search ? `${pathname}?${search}` : pathname ?? "/dev");
  const [recordMount, setRecordMount] = useState<{ key: number; pending: string | null }>({ key: 0, pending: null });
  if (recordMount.pending !== null && recordMount.pending === address) {
    setRecordMount({ key: recordMount.key + 1, pending: null });
  }
  const handleOpenPath = useCallback((path: string) => {
    if (comparableAddress(path) === address) {
      setRecordMount((current) => ({ key: current.key + 1, pending: null }));
      return;
    }
    setRecordMount((current) => ({ ...current, pending: comparableAddress(path) }));
    router.push(path);
  }, [address, router]);

  const readCurrentPath = useCallback(() => pathname ?? "/dev", [pathname]);
  const profileKey = useOwnedProfileKey(initialProfileKey, ownedProfileKey);

  return (
    <NextDevDataLoader
      routeState={routeState}
      initialProfileKey={profileKey}
      onTabChange={handleTabChange}
      onOpenPath={handleOpenPath}
      toolMountKey={recordMount.key}
      navigate={handleNavigate}
      getCurrentPath={readCurrentPath}
    />
  );
}
