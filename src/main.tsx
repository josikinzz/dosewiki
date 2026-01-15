import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import App from "./App";
import { DevModeProvider } from "./components/dev/DevModeContext";
import { ArticlesProvider, type LibraryData } from "./data/ArticlesProvider";
import { loadArticles, initializeWithSyncData, setArticlesCache } from "./data/articlesLoader";
import { buildLibrary } from "./data/builders/libraryBuilder";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ConvexProvider, isConvexEnabled } from "./lib/convex";
import { ConvexSyncProvider } from "./context/ConvexSyncContext";
import { api } from "../convex/_generated/api";
import type { SubstanceArticle } from "./schema";
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
 * Component that loads articles from Convex.
 * Used when VITE_CONVEX_URL is configured.
 */
function AppWithConvexData() {
  const convexArticles = useQuery(api.articles.getAll);
  const [error, setError] = useState<Error | null>(null);

  // Build library when Convex articles are loaded
  const libraryData = useMemo(() => {
    if (!convexArticles || convexArticles.length === 0) {
      return null;
    }
    // Strip Convex _id and _creationTime fields to match SubstanceArticle type
    const articles = convexArticles.map(({ _id, _creationTime, ...article }) => article) as SubstanceArticle[];
    // Update the articles cache so other parts of the app can access it
    setArticlesCache(articles);
    return buildLibrary(articles);
  }, [convexArticles]);

  if (error) {
    return <ErrorScreen error={error} />;
  }

  if (!libraryData) {
    return <LoadingScreen />;
  }

  return (
    <ArticlesProvider libraryData={libraryData}>
      <ConvexSyncProvider>
        <DevModeProvider>
          <App />
        </DevModeProvider>
      </ConvexSyncProvider>
    </ArticlesProvider>
  );
}

/**
 * Component that loads articles from compressed file (fallback).
 * Used when Convex is not configured or for inline builds.
 */
function AppWithFileData() {
  const [libraryData, setLibraryData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we're in inline build mode (sync data available)
    const isInlineBuild = import.meta.env.VITE_INLINE_BUILD === "true";

    if (isInlineBuild) {
      // For inline builds, data is bundled synchronously
      import("./data/articles.compressed")
        .then((mod) => {
          const articles = initializeWithSyncData(mod.articlesCompressedBase64);
          const library = buildLibrary(articles);
          setLibraryData(library);
        })
        .catch(setError);
    } else {
      // For standard builds, load asynchronously from compressed file
      loadArticles()
        .then((articles) => {
          const library = buildLibrary(articles);
          setLibraryData(library);
        })
        .catch(setError);
    }
  }, []);

  if (error) {
    return <ErrorScreen error={error} />;
  }

  if (!libraryData) {
    return <LoadingScreen />;
  }

  return (
    <ArticlesProvider libraryData={libraryData}>
      <ConvexSyncProvider>
        <DevModeProvider>
          <App />
        </DevModeProvider>
      </ConvexSyncProvider>
    </ArticlesProvider>
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
 * Wrapper that decides which data loader to use.
 * - If Convex is enabled → load from Convex (real-time updates)
 * - Otherwise → load from compressed file (static)
 */
function AppWithData() {
  // Check if we should use Convex
  const useConvex = isConvexEnabled();

  if (useConvex) {
    return <AppWithConvexData />;
  }

  return <AppWithFileData />;
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
