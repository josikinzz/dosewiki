"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConvexProvider as BaseConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { convex as sharedConvexClient, getConvexUrl } from "@/lib/convex";
import { LightweightDataProvider, type SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { getEmptyEditorLibrary } from "@/data/emptyLibrary";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { DevModePage } from "@/features/dev/pages/DevModePage";
import { tabNeedsLibrary } from "@/features/dev/pages/devModePageUtils";
import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import { parsePath, viewToPath } from "@/utils/routing";
import { useOwnedProfileKey } from "./useOwnedProfileKey";
import type { DevTab } from "@/types/navigation";

type NextDevRouteClientProps = {
  convexUrl: string | null;
  initialTab: DevTab;
  initialSlug?: string;
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
  tab: DevTab;
  slug?: string;
};

/**
 * Stand-in used while `categoryLayout.get` is still in flight. Only the review
 * workbench reads the lightweight layout, and that surface has graduated to
 * `/review` with its own provider, so an empty layout costs the dev shell
 * nothing and buys it a tab rail that paints without a websocket round trip.
 */
const EMPTY_CATEGORY_LAYOUT: CategoryLayout = { version: 0, categories: [] };

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

export function resolveDevRouteState(pathname: string | null, fallback: DevRouteState): DevRouteState {
  if (!pathname) {
    return fallback;
  }

  const parsed = parsePath(pathname, fallback.slug ?? null, {
    type: "dev",
    tab: fallback.tab,
    slug: fallback.slug,
  });

  if (parsed.type !== "dev") {
    return fallback;
  }

  return {
    tab: parsed.tab,
    slug: parsed.slug,
  };
}

function NextDevDataLoader({ routeState, initialProfileKey, onTabChange, navigate, getCurrentPath }: {
  routeState: DevRouteState;
  initialProfileKey?: string;
  onTabChange: (tab: DevTab) => void;
  navigate: (path: string) => void;
  getCurrentPath: () => string;
}) {
  const categoryLayout = useQuery(api.categoryLayout.get);
  // Only the corpus-backed tools drain the editor projection, and once a
  // session has drained it the library stays mounted: navigating from the
  // article editor to a non-library tool must not throw away unsaved edits
  // held in `DevModeProvider`, which is fed from this library.
  const needsLibrary = useLibraryLatch(tabNeedsLibrary(routeState.tab));
  const { library, isLoading: isLoadingLibrary } = useLazyLibrary(needsLibrary);

  // The editor projection already carries slug/name/priority for every row, so
  // the lookup drain that used to re-scan the same table for them is gone.
  // `allSubstanceRecords` (not `substanceRecords`) keeps the hidden and
  // direct-URL-only entries the lookup used to include.
  const substances = useMemo<SubstanceLookupEntry[]>(
    () =>
      (library?.allSubstanceRecords ?? []).map((record) => ({
        slug: record.slug,
        name: record.name,
        priority: record.priority,
      })),
    [library],
  );

  const layout = useMemo<CategoryLayout>(() => {
    if (!categoryLayout) {
      return EMPTY_CATEGORY_LAYOUT;
    }

    return {
      version: categoryLayout.version,
      categories: categoryLayout.categories.map((category) => ({
        key: category.key,
        label: category.label,
        iconKey: category.iconKey,
        sections: category.sections.map((section) => ({
          key: section.key,
          label: section.label,
          drugs: section.drugs,
        })),
        drugs: category.drugs,
        columns: category.columns,
      })),
    };
  }, [categoryLayout]);

  // Nothing gates the shell any more. The tab rail paints on the first client
  // render; the category layout and the corpus drain both land behind it, and
  // the tools that need either show their own loading state instead of holding
  // the chrome back. A category layout that resolves to nothing is still a
  // hard failure, but only once the query has actually answered.
  if (categoryLayout === null) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Failed to load editor data</div>
        <div className="theme-text-muted text-sm">Category layout is missing from Convex.</div>
      </div>
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      <SubstanceIndexProvider libraryData={library ?? getEmptyEditorLibrary()}>
        <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath}>
          <DevModePage
            activeTab={routeState.tab}
            initialArticleSlug={routeState.slug}
            initialProfileKey={initialProfileKey}
            isLibraryLoading={isLoadingLibrary || !library}
            onTabChange={onTabChange}
          />
        </DevModeProvider>
      </SubstanceIndexProvider>
    </LightweightDataProvider>
  );
}

export function NextDevRouteClient({
  convexUrl,
  initialTab,
  initialSlug,
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
  const fallbackRouteState = useMemo<DevRouteState>(() => ({
    tab: initialTab,
    slug: initialSlug,
  }), [initialSlug, initialTab]);
  const routeState = useMemo(
    () => resolveDevRouteState(pathname, fallbackRouteState),
    [fallbackRouteState, pathname],
  );

  const handleTabChange = useCallback((tab: DevTab) => {
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
