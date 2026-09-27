"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSectionLoadingModel, RouteLoading } from "@/app/_components/RouteLoading";
import { StateCard } from "@/components/common/StateCard";
import { LoadErrorState } from "@/features/dev/components/LoadErrorState";
import { useWriteFreezeObserver } from "@/features/dev/components/writeFreeze";
import { LightweightDataProvider, type SubstanceLookupEntry } from "@/data/LightweightDataProvider";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { useLazyLibrary } from "@/hooks/useLazyLibrary";
import { resolveEditorArticleSlug } from "@/features/dev/context/devModeUtils";
import { DevModeProvider } from "@/features/dev/context/DevModeContext";
import { useDevModePageController } from "@/features/dev/pages/useDevModePageController";
import { ReviewExperience } from "@/features/dev/tools/review-mode/ReviewExperience";
import { useCategoryLayout, type CategoryLayout } from "@/hooks/useCategoryLayout";
import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";

type ReviewRouteClientProps = {
  initialSlug?: string;
};

/**
 * Workbench host: the same data/provider stack the /dev shell mounts, minus
 * the dev-tools page chrome. The dev page controller still runs underneath so
 * the editor view's commit panel behaves identically to the main editor tab.
 */
function ReviewWorkbench({ initialSlug, libraryEmpty }: { initialSlug?: string; libraryEmpty: boolean }) {
  const router = useRouter();

  const onTabChange = useCallback(
    (tab: DevModeTab) => {
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

  // An empty library is an answer, not a pending load: the workbench says
  // there is nothing to review rather than wait for rows that never come.
  if (controller.articlesLength === 0 && !libraryEmpty) {
    return (
      <main className="theme-page-shell flex min-h-screen items-center justify-center p-8">
        <StateCard loading title="Loading the review queue" />
      </main>
    );
  }

  return (
    <ReviewExperience initialSlug={initialSlug} />
  );
}

function ReviewDataLoader({ initialSlug }: { initialSlug?: string }) {
  const { layout: categoryLayout } = useCategoryLayout();
  const { library, isLoading: isLoadingLibrary, error: libraryError, requestLibrary } = useLazyLibrary(true);
  const router = useRouter();
  const pathname = usePathname();

  // The slim library rows already carry everything the lightweight lookup
  // needs (slug, name, priority), so the separate getLookupPage drain is gone.
  const substances = useMemo<SubstanceLookupEntry[]>(() => {
    if (!library) {
      return [];
    }

    return library.articles.flatMap((article) => {
      const slug = resolveEditorArticleSlug(article);
      if (!slug) return [];
      return [{
        slug,
        name: article.title || article.identification?.common_name || slug,
        priority: article.priority,
      }];
    });
  }, [library]);

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
  const retryLibrary = useCallback(() => {
    // The hook reports the outcome through `error` and `library`.
    requestLibrary().catch(() => {});
  }, [requestLibrary]);

  if (libraryError && !library) {
    return (
      <main className="theme-page-shell min-h-screen p-8">
        <div className="mx-auto max-w-xl pt-16">
          <LoadErrorState
            what="the review queue"
            message={libraryError}
            onRetry={retryLibrary}
            secondary={<Link href="/dev" className="text-dose-accent-strong theme-accent-underline text-sm underline-offset-4 hover:underline">Back to the editor</Link>}
          />
        </div>
      </main>
    );
  }
  if (categoryLayout === undefined || isLoadingLibrary || !library) {
    // Content-shaped skeleton instead of a full-screen splash: the shell stays
    // up and the load reads as the page assembling rather than the app
    // rebooting. The branded LoadingScreen stays cataloged in /dev/kit for
    // genuine full-screen boot holds.
    return (
      <div className="theme-page-shell min-h-screen overflow-y-auto px-4 py-10">
        <RouteLoading
          model={getSectionLoadingModel({
            key: "review-workbench",
            label: "Loading review workbench",
            variant: "article",
            density: "normal",
          })}
        />
      </div>
    );
  }

  if (!layout) {
    return (
      <main className="theme-page-shell min-h-screen p-8">
        <div className="mx-auto max-w-xl pt-16">
          <LoadErrorState
            what="the review queue"
            message="The category layout the queue is grouped by is missing from the server. Index layout can publish one."
            onRetry={() => window.location.reload()}
            secondary={<Link href="/dev/index-layout" className="text-dose-accent-strong theme-accent-underline text-sm underline-offset-4 hover:underline">Open Index layout</Link>}
          />
        </div>
      </main>
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      <SubstanceIndexProvider libraryData={library}>
        <DevModeProvider navigate={navigate} getCurrentPath={getCurrentPath}>
          <ReviewWorkbench initialSlug={initialSlug} libraryEmpty={library.articles.length === 0} />
        </DevModeProvider>
      </SubstanceIndexProvider>
    </LightweightDataProvider>
  );
}

/**
 * Reads go through the `/api/editor/*` routes on the layout-level TanStack
 * Query client, mirroring the /dev shell (see NextDevRouteClient).
 */
export function ReviewRouteClient({ initialSlug }: ReviewRouteClientProps) {
  // Outside the /dev shell, so the workbench watches its own writes for the
  // write freeze; the review dock reads it.
  useWriteFreezeObserver();
  return <ReviewDataLoader initialSlug={initialSlug} />;
}
