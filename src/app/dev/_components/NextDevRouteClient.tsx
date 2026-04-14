"use client";

import { useCallback, useMemo, useState } from "react";
import { ConvexProvider as BaseConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { LightweightDataProvider, type SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { ConvexSyncProvider } from "@/context/ConvexSyncContext";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { DevModePage } from "@/features/dev/pages/DevModePage";
import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import { parsePath, viewToPath } from "@/utils/routing";
import type { DevTab } from "@/types/navigation";

type NextDevRouteClientProps = {
  convexUrl: string | null;
  initialTab: DevTab;
  initialSlug?: string;
  initialProfileKey?: string;
};

type DevRouteState = {
  tab: DevTab;
  slug?: string;
};

const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
};

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
  const slugNameMap = useQuery(api.substanceIndex.getSlugNameMap);
  const { library, isLoading: isLoadingLibrary } = useLazyLibrary(true);

  const substances = useMemo<SubstanceLookupEntry[]>(() => {
    if (!slugNameMap) {
      return [];
    }

    return slugNameMap.map((item) => ({
      slug: item.slug,
      name: item.name,
      priority: item.priority,
    }));
  }, [slugNameMap]);

  const layout = useMemo<CategoryLayout | null>(() => {
    if (!categoryLayout) {
      return null;
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

  if (categoryLayout === undefined || slugNameMap === undefined || isLoadingLibrary || !library) {
    return <LoadingScreen />;
  }

  if (!layout) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Failed to load editor data</div>
        <div className="theme-text-muted text-sm">Category layout is missing from Convex.</div>
      </div>
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      <SubstanceIndexProvider libraryData={library}>
        <ConvexSyncProvider>
          <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath}>
            <DevModePage
              activeTab={routeState.tab}
              initialArticleSlug={routeState.slug}
              initialProfileKey={initialProfileKey}
              onTabChange={onTabChange}
            />
          </DevModeProvider>
        </ConvexSyncProvider>
      </SubstanceIndexProvider>
    </LightweightDataProvider>
  );
}

export function NextDevRouteClient({ convexUrl, initialTab, initialSlug, initialProfileKey }: NextDevRouteClientProps) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions));
  const convexClient = useMemo(() => (convexUrl ? new ConvexReactClient(convexUrl) : null), [convexUrl]);
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

  if (!convexClient) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Convex is not configured</div>
        <div className="theme-text-muted text-sm">Set `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL` for the Next `/dev` shell.</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BaseConvexProvider client={convexClient}>
        <NextDevDataLoader
          routeState={routeState}
          initialProfileKey={initialProfileKey}
          onTabChange={handleTabChange}
          navigate={handleNavigate}
          getCurrentPath={readCurrentPath}
        />
      </BaseConvexProvider>
    </QueryClientProvider>
  );
}
