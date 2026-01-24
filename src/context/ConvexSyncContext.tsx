import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexEnabled } from "../lib/convex";
import type { SubstanceArticle } from "../schema";

// ============================================================================
// Types
// ============================================================================

export type ConvexSyncStatus =
  | "idle"          // No pending changes
  | "pending"       // Changes waiting for debounce
  | "syncing"       // Currently syncing to Convex
  | "synced"        // Successfully synced
  | "error";        // Sync failed

export interface ConvexSyncState {
  status: ConvexSyncStatus;
  lastSyncedAt: Date | null;
  pendingCount: number;
  error: string | null;
}

interface ConvexSyncContextValue {
  state: ConvexSyncState;
  syncArticles: (articles: SubstanceArticle[]) => void;
  syncNow: () => Promise<void>;
  isEnabled: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_MS = 2000; // Wait 2 seconds after last change before syncing
const SYNC_COOLDOWN_MS = 1000; // Show "synced" status for 1 second

// ============================================================================
// Context
// ============================================================================

const ConvexSyncContext = createContext<ConvexSyncContextValue | null>(null);

// ============================================================================
// Provider (when Convex is enabled)
// ============================================================================

function ConvexSyncProviderEnabled({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConvexSyncState>({
    status: "idle",
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArticlesRef = useRef<SubstanceArticle[] | null>(null);
  const isSyncingRef = useRef(false);
  const isReadyRef = useRef(false);

  const saveArticlesMutation = useConvexMutation(api.substanceIndex.saveSubstances);

  // Mark as ready after a short delay to let Convex connect
  useEffect(() => {
    const timer = setTimeout(() => {
      isReadyRef.current = true;
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const performSync = useCallback(async (articles: SubstanceArticle[]) => {
    // Don't sync if not ready or already syncing
    if (!isReadyRef.current || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    setState((prev) => ({
      ...prev,
      status: "syncing",
      error: null,
    }));

    try {
      await saveArticlesMutation({ articles });
      
      const now = new Date();
      setState({
        status: "synced",
        lastSyncedAt: now,
        pendingCount: 0,
        error: null,
      });

      // Return to idle after cooldown
      setTimeout(() => {
        setState((prev) => 
          prev.status === "synced" ? { ...prev, status: "idle" } : prev
        );
      }, SYNC_COOLDOWN_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      console.error("[ConvexSync] Sync failed:", message);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    } finally {
      isSyncingRef.current = false;
      pendingArticlesRef.current = null;
    }
  }, [saveArticlesMutation]);

  const syncArticles = useCallback((articles: SubstanceArticle[]) => {
    // Store pending articles
    pendingArticlesRef.current = articles;

    // Update state to show pending
    setState((prev) => ({
      ...prev,
      status: "pending",
      pendingCount: articles.length,
    }));

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      const articlesToSync = pendingArticlesRef.current;
      if (articlesToSync) {
        performSync(articlesToSync);
      }
    }, DEBOUNCE_MS);
  }, [performSync]);

  const syncNow = useCallback(async () => {
    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Sync pending articles immediately
    const articlesToSync = pendingArticlesRef.current;
    if (articlesToSync) {
      await performSync(articlesToSync);
    }
  }, [performSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const value = useMemo<ConvexSyncContextValue>(() => ({
    state,
    syncArticles,
    syncNow,
    isEnabled: true,
  }), [state, syncArticles, syncNow]);

  return (
    <ConvexSyncContext.Provider value={value}>
      {children}
    </ConvexSyncContext.Provider>
  );
}

// ============================================================================
// Provider (when Convex is disabled)
// ============================================================================

const DISABLED_VALUE: ConvexSyncContextValue = {
  state: {
    status: "idle",
    lastSyncedAt: null,
    pendingCount: 0,
    error: null,
  },
  syncArticles: () => {},
  syncNow: async () => {},
  isEnabled: false,
};

function ConvexSyncProviderDisabled({ children }: { children: ReactNode }) {
  return (
    <ConvexSyncContext.Provider value={DISABLED_VALUE}>
      {children}
    </ConvexSyncContext.Provider>
  );
}

// ============================================================================
// Public Provider
// ============================================================================

export function ConvexSyncProvider({ children }: { children: ReactNode }) {
  if (isConvexEnabled()) {
    return <ConvexSyncProviderEnabled>{children}</ConvexSyncProviderEnabled>;
  }
  return <ConvexSyncProviderDisabled>{children}</ConvexSyncProviderDisabled>;
}

// ============================================================================
// Hook
// ============================================================================

export function useConvexSync(): ConvexSyncContextValue {
  const context = useContext(ConvexSyncContext);
  if (!context) {
    throw new Error("useConvexSync must be used within a ConvexSyncProvider");
  }
  return context;
}
