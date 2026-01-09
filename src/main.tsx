import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DevModeProvider } from "./components/dev/DevModeContext";
import { ArticlesProvider, type LibraryData } from "./data/ArticlesProvider";
import { loadArticles, initializeWithSyncData } from "./data/articlesLoader";
import { buildLibrary } from "./data/builders/libraryBuilder";
import { LoadingScreen } from "./components/common/LoadingScreen";
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
 * Wrapper component that handles async article loading.
 * Shows loading screen until data is ready.
 */
function AppWithData() {
  const [libraryData, setLibraryData] = useState<LibraryData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if we're in inline build mode (sync data available)
    const isInlineBuild = import.meta.env.VITE_INLINE_BUILD === "true";

    if (isInlineBuild) {
      // For inline builds, data is bundled synchronously
      // Import the compressed data and initialize synchronously
      import("./data/articles.compressed")
        .then((mod) => {
          const articles = initializeWithSyncData(mod.articlesCompressedBase64);
          const library = buildLibrary(articles);
          setLibraryData(library);
        })
        .catch(setError);
    } else {
      // For standard builds, load asynchronously
      loadArticles()
        .then((articles) => {
          const library = buildLibrary(articles);
          setLibraryData(library);
        })
        .catch(setError);
    }
  }, []);

  if (error) {
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

  if (!libraryData) {
    return <LoadingScreen />;
  }

  return (
    <ArticlesProvider libraryData={libraryData}>
      <DevModeProvider>
        <App />
      </DevModeProvider>
    </ArticlesProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppWithData />
    </QueryClientProvider>
  </React.StrictMode>
);
