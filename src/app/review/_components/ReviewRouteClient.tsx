"use client";

import { useCallback, useMemo } from "react";
import { ConvexProvider as BaseConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { convex as sharedConvexClient, getConvexUrl } from "@/lib/convex";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { StateCard } from "@/components/common/StateCard";
import { LightweightDataProvider, type SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { useSubstanceLookup } from "@/hooks/useSubstanceLookup";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { useDevModePageController } from "@/features/dev/pages/useDevModePageController";
import { ReviewExperience } from "@/features/dev/tools/review-mode/ReviewExperience";
import type { CategoryLayout } from "@/hooks/useCategoryLayout";
import type { DevTab } from "@/types/navigation";

type ReviewRouteClientProps = {
  convexUrl: string | null;
  initialSlug?: string;
};

/**
 * Workbench host: the same data/provider stack the /dev shell mounts, minus
 * the dev-tools page chrome. The dev page controller still runs underneath so
 * the editor view's commit panel behaves identically to the main editor tab.
 */
function ReviewWorkbench({ initialSlug }: { initialSlug?: string }) {
  const router = useRouter();

  const onTabChange = useCallback(
    (tab: DevTab) => {
      // The workbench has no tab strip; any shell-level tab change (e.g. the
      // non-editor bounce to "profile") returns to the dev shell.
      router.push(`/dev/${tab}`);
    },
    [router],
  );

  const controller = useDevModePageController({
    activeTab: "review",
    initialArticleSlug: initialSlug,
    onTabChange,
  });

  if (controller.articlesLength === 0) {
    return (
      <main className="theme-page-shell flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <StateCard
            icon="lucide:badge-check"
            tone="accent"
            loading
            align="center"
            title="Loading the review queue"
            description="Pulling the latest substance dataset. This only takes a moment."
          />
        </div>
      </main>
    );
  }

  return (
    <ReviewExperience
      renderCommitPanel={controller.renderCommitPanel}
      initialSlug={initialSlug}
    />
  );
}

function ReviewDataLoader({ initialSlug }: { initialSlug?: string }) {
  const categoryLayout = useQuery(api.categoryLayout.get);
  const { lookup: slugNameMap } = useSubstanceLookup();
  const { library, isLoading: isLoadingLibrary } = useLazyLibrary(true);
  const router = useRouter();
  const pathname = usePathname();

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

  const navigate = useCallback((path: string) => router.push(path), [router]);
  const getCurrentPath = useCallback(() => pathname ?? "/review", [pathname]);

  if (categoryLayout === undefined || slugNameMap === undefined || isLoadingLibrary || !library) {
    return <LoadingScreen />;
  }

  if (!layout) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Failed to load review data</div>
        <div className="theme-text-muted text-sm">Category layout is missing from Convex.</div>
      </div>
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      <SubstanceIndexProvider libraryData={library}>
        <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath}>
          <ReviewWorkbench initialSlug={initialSlug} />
        </DevModeProvider>
      </SubstanceIndexProvider>
    </LightweightDataProvider>
  );
}

export function ReviewRouteClient({ convexUrl, initialSlug }: ReviewRouteClientProps) {
  // Reuse the shared Convex client when the server-selected URL matches the
  // browser default, mirroring the /dev shell (see NextDevRouteClient).
  const convexClient = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    if (sharedConvexClient && getConvexUrl() === convexUrl) {
      return sharedConvexClient;
    }
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convexClient) {
    return (
      <div className="theme-page-shell fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-bold text-red-400">Convex is not configured</div>
        <div className="theme-text-muted text-sm">
          Set `NEXT_PUBLIC_CONVEX_URL` or `VITE_CONVEX_URL` for the review workbench.
        </div>
      </div>
    );
  }

  return (
    <BaseConvexProvider client={convexClient}>
      <ReviewDataLoader initialSlug={initialSlug} />
    </BaseConvexProvider>
  );
}
