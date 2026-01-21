import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import App from "./App";
import { DevModeProvider } from "@/features/dev";
import { LightweightDataProvider, type SubstanceLookupEntry } from "./data/LightweightDataProvider";
import { SubstanceIndexProvider, type LibraryData } from "./data/SubstanceIndexProvider";
import { useLazyLibrary } from "./hooks/useLazyLibrary";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ConvexProvider, isConvexEnabled } from "./lib/convex";
import { ConvexSyncProvider } from "./context/ConvexSyncContext";
import { api } from "../convex/_generated/api";
import type { CategoryLayout } from "./hooks/useCategoryLayout";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes (formerly cacheTime)
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isSafari =
  userAgent.includes("Safari") &&
  !userAgent.includes("Chrome") &&
  !userAgent.includes("Chromium") &&
  !userAgent.includes("Android");

if (isSafari) {
  document.documentElement.classList.add("is-safari");
}

/**
 * Empty library placeholder used before the full library is loaded.
 * Pages can check if articles.length === 0 to show loading states.
 */
const EMPTY_LIBRARY: LibraryData = {
  articles: [],
  allSubstanceRecords: [],
  substanceRecords: [],
  allSubstancesBySlug: new Map(),
  substanceBySlug: new Map(),
  interactionIndex: {
    entries: [],
    bySlug: new Map(),
    bySourceSlug: new Map(),
    findMatchingEntry: () => undefined,
    getInteractionsForEntry: () => [],
    hasInteractions: () => false,
  },
  dosageCategoryGroups: [],
  chemicalClassIndexGroups: [],
  mechanismIndexGroups: [],
  effectSummaries: [],
  mechanismSummaries: [],
  findCategoryByKey: () => undefined,
  normalizeCategoryKey: (v) => v.toLowerCase().replace(/\s+/g, "-"),
  getCategoryDetail: () => null,
  getEffectDetail: () => null,
  getEffectSummary: () => undefined,
  getMechanismDetail: () => null,
  getMechanismSummary: () => undefined,
  getChemicalClassDetail: () => null,
  getPsychoactiveClassDetail: () => null,
  getInteractionsForSubstance: () => undefined,
  buildCategoryGroupsForRecords: () => [],
};

/**
 * Check if a path needs the full library loaded.
 * Once true, stays true for the session (no point unloading).
 */
function checkIfNeedsLibrary(path: string): boolean {
  return (
    path.startsWith("/dev") ||
    path.startsWith("/about") ||
    path.startsWith("/mechanism") ||
    path.startsWith("/chemical") ||
    path.startsWith("/psychoactive") ||
    path.startsWith("/category") ||
    path.startsWith("/search") ||
    // TripReportDetailPage uses useLibrary for substance linking
    (path.startsWith("/reports/") && path.length > 9)
  );
}

/**
 * Lazy-loading wrapper for SubstanceIndexProvider.
 * Starts loading library when on /dev routes or pages that need full library.
 */
function LazySubstanceIndexProvider({ children }: { children: React.ReactNode }) {
  // Single state for whether library is needed - once true, stays true
  const [needsLibrary, setNeedsLibrary] = useState(() => {
    if (typeof window === "undefined") return false;
    const initialPath = window.location.pathname;
    const needs = checkIfNeedsLibrary(initialPath);
    console.log("[LazySubstanceIndexProvider] Initial check - path:", initialPath, "needsLibrary:", needs);
    return needs;
  });

  // Listen for route changes - needs to intercept pushState/replaceState too
  useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname;
      const needs = checkIfNeedsLibrary(path);
      console.log("[LazySubstanceIndexProvider] Route change - path:", path, "needsLibrary:", needs);
      if (needs) {
        setNeedsLibrary(true);
      }
    };

    // Handle popstate (back/forward navigation)
    window.addEventListener("popstate", handleRouteChange);

    // Intercept pushState and replaceState to detect SPA navigation
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      originalPushState(...args);
      console.log("[LazySubstanceIndexProvider] pushState intercepted, new path:", window.location.pathname);
      handleRouteChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState(...args);
      console.log("[LazySubstanceIndexProvider] replaceState intercepted, new path:", window.location.pathname);
      handleRouteChange();
    };

    // Check immediately in case URL already needs library
    handleRouteChange();

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      // Restore original methods
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []); // Empty deps = stable listener, no recreation

  // Lazy-load library only when needed
  const { library } = useLazyLibrary(needsLibrary);

  console.log("[LazySubstanceIndexProvider] needsLibrary:", needsLibrary, "library:", library ? `loaded(${library.articles.length})` : "null");

  // Always provide SubstanceIndexProvider - with real data or empty placeholder
  return (
    <SubstanceIndexProvider libraryData={library ?? EMPTY_LIBRARY}>
      {children}
    </SubstanceIndexProvider>
  );
}

/**
 * Component that loads lightweight data from Convex for fast initial render.
 * Only loads category layout (~14KB) and slug-name map (~20KB) on startup.
 * Full article data is loaded on-demand by individual pages.
 */
function AppWithConvexData() {
  // Load lightweight data only - not the full 5MB article collection
  const categoryLayout = useQuery(api.categoryLayout.get);
  const slugNameMap = useQuery(api.substanceIndex.getSlugNameMap);
  const [error, setError] = useState<Error | null>(null);

  // Compute substances from slug-name map
  const substances = useMemo<SubstanceLookupEntry[]>(() => {
    if (!slugNameMap) return [];
    return slugNameMap.map((item) => ({
      slug: item.slug,
      name: item.name,
      priority: item.priority,
    }));
  }, [slugNameMap]);

  // Create layout from Convex data
  const layout = useMemo<CategoryLayout | null>(() => {
    if (!categoryLayout) return null;
    return {
      version: categoryLayout.version,
      categories: categoryLayout.categories.map((cat: {
        key: string;
        label: string;
        iconKey: string;
        sections: { key: string; label: string; drugs: string[] }[];
        drugs: string[];
        columns?: Record<string, number>;
      }) => ({
        key: cat.key,
        label: cat.label,
        iconKey: cat.iconKey,
        sections: cat.sections.map((sec: { key: string; label: string; drugs: string[] }) => ({
          key: sec.key,
          label: sec.label,
          drugs: sec.drugs,
        })),
        drugs: cat.drugs,
        columns: cat.columns,
      })),
    };
  }, [categoryLayout]);

  if (error) {
    return <ErrorScreen error={error} />;
  }

  // Show loading while fetching lightweight data (fast - ~34KB total)
  if (categoryLayout === undefined || slugNameMap === undefined) {
    return <LoadingScreen />;
  }

  // Handle case where category layout doesn't exist yet
  if (!layout) {
    return (
      <ErrorScreen
        error={new Error("Category layout not found. Run: node scripts/seed-category-layout.mjs")}
      />
    );
  }

  return (
    <LightweightDataProvider layout={layout} substances={substances}>
      <LazySubstanceIndexProvider>
        <ConvexSyncProvider>
          <DevModeProvider>
            <App />
          </DevModeProvider>
        </ConvexSyncProvider>
      </LazySubstanceIndexProvider>
    </LightweightDataProvider>
  );
}


/**
 * Error screen component.
 */
function ErrorScreen({ error }: { error: Error }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f] p-8 text-center text-white">
      <div className="text-2xl font-bold text-red-400">Failed to load data</div>
      <div className="text-sm text-white/60">{error.message}</div>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * Wrapper that ensures Convex is configured before loading the app.
 * Shows an error screen if VITE_CONVEX_URL is not set.
 */
function AppWithData() {
  if (!isConvexEnabled()) {
    return (
      <ErrorScreen
        error={new Error("Convex not configured. Set VITE_CONVEX_URL environment variable.")}
      />
    );
  }
  return <AppWithConvexData />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConvexProvider>
      <QueryClientProvider client={queryClient}>
        <AppWithData />
      </QueryClientProvider>
    </ConvexProvider>
  </React.StrictMode>
);
