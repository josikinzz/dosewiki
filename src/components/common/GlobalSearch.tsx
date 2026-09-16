import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Search, X } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { loadSearchManifestIndex } from "../../hooks/useSearchManifest";
import type { AppView } from "../../types/navigation";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useT, useUiLocale } from "@/i18n/client";

const DEBOUNCE_MS = 200;
/**
 * Delay before re-running a query that is already on the results page. This used
 * to be 3000ms to hide a search backend that took ~1s per request; the index is
 * now built once per cache window and queried in single-digit milliseconds, so
 * the wait only has to cover a burst of keystrokes.
 */
export const LIVE_RESULTS_SETTLE_MS = 250;
const LIVE_SEARCH_ORIGIN_STORAGE_KEY = "dosewiki-live-search-origin-view";

interface GlobalSearchProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onReplaceNavigate?: (view: AppView) => void;
  onLiveNavigate?: (view: AppView) => void;
  containerClassName?: string;
  compact?: boolean;
  liveResultsMode?: boolean;
  liveSearchClearView?: AppView | null;
  onSearchModeChange?: (isSearchMode: boolean) => void;
  placeholder?: string;
  variant?: "default" | "home";
}

const readStoredLiveSearchOriginView = (): AppView | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(LIVE_SEARCH_ORIGIN_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AppView;
  } catch {
    window.sessionStorage.removeItem(LIVE_SEARCH_ORIGIN_STORAGE_KEY);
    return null;
  }
};

const writeStoredLiveSearchOriginView = (view: AppView) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(LIVE_SEARCH_ORIGIN_STORAGE_KEY, JSON.stringify(view));
};

const clearStoredLiveSearchOriginView = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(LIVE_SEARCH_ORIGIN_STORAGE_KEY);
};

const areAppViewsEquivalent = (left: AppView | null, right: AppView | null) => {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (leftRecord[key] !== rightRecord[key]) {
      return false;
    }
  }
  return true;
};

export function GlobalSearch({
  currentView,
  onNavigate,
  onReplaceNavigate,
  onLiveNavigate,
  containerClassName,
  compact = false,
  liveResultsMode = false,
  liveSearchClearView = null,
  onSearchModeChange,
  placeholder,
  variant = "default",
}: GlobalSearchProps) {
  const t = useT();
  const locale = useUiLocale();
  const [query, setQuery] = useState(() => currentView.type === "search" ? currentView.query : "");
  const [isActiveSearch, setIsActiveSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingLiveNavigationRef = useRef(false);
  const isEditingLiveSearchRef = useRef(false);
  const pendingLiveFocusRestoreQueryRef = useRef<string | null>(null);
  const lastLiveNavigationQueryRef = useRef<string | null>(currentView.type === "search" ? currentView.query.trim() : null);
  const queryRef = useRef(query);
  const liveSearchOriginViewRef = useRef<AppView | null>(null);
  const inputId = useId();
  const requestSearchManifest = useCallback(() => {
    void loadSearchManifestIndex(locale);
  }, [locale]);

  const restoreLiveSearchInputFocus = useCallback((nextQuery: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) {
        return;
      }

      target.focus({ preventScroll: true });

      const cursorPosition = nextQuery.length;
      try {
        target.setSelectionRange(cursorPosition, cursorPosition);
      } catch {
        // Some search input implementations do not expose selection ranges.
      }
    });
  }, []);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (currentView.type === "search") {
      const routeMatchesLocalDraft = queryRef.current.trim() === currentView.query.trim();
      const shouldRestoreLiveFocus =
        liveResultsMode &&
        pendingLiveFocusRestoreQueryRef.current !== null &&
        pendingLiveFocusRestoreQueryRef.current.trim() === currentView.query.trim() &&
        routeMatchesLocalDraft;

      if (
        liveResultsMode &&
        isEditingLiveSearchRef.current &&
        !routeMatchesLocalDraft
      ) {
        return;
      }
      setQuery(currentView.query);
      if (shouldRestoreLiveFocus || (liveResultsMode && isEditingLiveSearchRef.current && routeMatchesLocalDraft)) {
        pendingLiveFocusRestoreQueryRef.current = null;
        isEditingLiveSearchRef.current = true;
        setIsActiveSearch(true);
        restoreLiveSearchInputFocus(currentView.query);
        return;
      }
    } else {
      const hasPendingLiveSearchDraft = pendingLiveFocusRestoreQueryRef.current !== null;
      if (
        liveResultsMode &&
        isEditingLiveSearchRef.current &&
        hasPendingLiveSearchDraft &&
        areAppViewsEquivalent(currentView, liveSearchOriginViewRef.current)
      ) {
        return;
      }

      isEditingLiveSearchRef.current = false;
      pendingLiveFocusRestoreQueryRef.current = null;
      lastLiveNavigationQueryRef.current = null;
      setQuery("");
      liveSearchOriginViewRef.current = currentView;
      if (liveResultsMode) {
        writeStoredLiveSearchOriginView(currentView);
      }
    }
    setIsActiveSearch(false);
  }, [currentView, liveResultsMode, restoreLiveSearchInputFocus]);

  useEffect(() => {
    if (!liveResultsMode) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const isInsideSearch =
        containerRef.current?.contains(target) ?? false;
      if (isInsideSearch) {
        return;
      }

      pendingLiveFocusRestoreQueryRef.current = null;
      isEditingLiveSearchRef.current = false;
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [liveResultsMode]);

  const liveNavigationQuery = useDebouncedValue(
    query,
    currentView.type === "search" ? LIVE_RESULTS_SETTLE_MS : DEBOUNCE_MS,
  );

  const hasQuery = query.trim().length > 0;
  const clearButtonVisible = hasQuery;

  const isHomeVariant = variant === "home";
  const isSearchMode = isActiveSearch && hasQuery;
  const isHomeSearchMode = isHomeVariant && isActiveSearch;

  useEffect(() => {
    onSearchModeChange?.(isHomeVariant ? isHomeSearchMode : isSearchMode);
  }, [isHomeSearchMode, isHomeVariant, isSearchMode, onSearchModeChange]);

  const currentSearchQuery = currentView.type === "search" ? currentView.query : "";

  useEffect(() => {
    if (!liveResultsMode) {
      return;
    }

    const trimmed = liveNavigationQuery.trim();
    if (!trimmed && currentView.type !== "search") {
      return;
    }

    if (trimmed !== queryRef.current.trim()) {
      return;
    }

    if (!trimmed && !isEditingLiveSearchRef.current) {
      return;
    }

    if (currentView.type !== "search" && !pendingLiveNavigationRef.current) {
      return;
    }

    const routeMatchesQuery = currentView.type === "search" && currentSearchQuery.trim() === trimmed;
    const alreadyRequestedQuery = lastLiveNavigationQueryRef.current === trimmed;

    if (routeMatchesQuery && (!isEditingLiveSearchRef.current || alreadyRequestedQuery)) {
      return;
    }

    const nextView = { type: "search", query: trimmed } satisfies AppView;
    const navigate = currentView.type === "search" ? onReplaceNavigate ?? onNavigate : onLiveNavigate ?? onNavigate;
    pendingLiveNavigationRef.current = false;
    lastLiveNavigationQueryRef.current = trimmed;
    navigate(nextView);
  }, [currentSearchQuery, currentView.type, liveNavigationQuery, liveResultsMode, onLiveNavigate, onNavigate, onReplaceNavigate]);

  const closeSearchMode = useCallback(() => {
    setIsActiveSearch(false);
  }, []);

  // Android keyboard scroll fix
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!/Android/i.test(navigator.userAgent)) {
      return;
    }

    const handleResize = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement || activeElement.tagName !== 'INPUT') {
        return;
      }

      window.requestAnimationFrame(() => {
        const { scrollIntoViewIfNeeded } = activeElement as HTMLElement & {
          scrollIntoViewIfNeeded?: () => void;
        };
        if (typeof scrollIntoViewIfNeeded === 'function') {
          scrollIntoViewIfNeeded.call(activeElement);
          return;
        }

        activeElement.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'auto',
        });
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSubmit = useCallback(() => {
    requestSearchManifest();
    const trimmed = query.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    isEditingLiveSearchRef.current = false;
    pendingLiveFocusRestoreQueryRef.current = null;
    lastLiveNavigationQueryRef.current = trimmed;
    closeSearchMode();
    onNavigate({ type: "search", query: trimmed });
    inputRef.current?.blur();
  }, [closeSearchMode, onNavigate, query, requestSearchManifest]);

  const handleFocus = useCallback(() => {
    setIsActiveSearch(true);
    requestSearchManifest();
  }, [requestSearchManifest]);

  const handleInputPointerDown = useCallback(() => {
    if (isHomeVariant) {
      setIsActiveSearch(true);
    }
  }, [isHomeVariant]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const isInsideSearch = containerRef.current?.contains(active) ?? false;
      if (!active || !isInsideSearch) {
        isEditingLiveSearchRef.current = false;
        closeSearchMode();
      }
    });
  }, [closeSearchMode]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    if (liveResultsMode) {
      isEditingLiveSearchRef.current = true;
      pendingLiveFocusRestoreQueryRef.current = nextQuery;
      if (currentView.type !== "search") {
        liveSearchOriginViewRef.current = currentView;
        writeStoredLiveSearchOriginView(currentView);
      }
      pendingLiveNavigationRef.current = true;
    }
    setQuery(nextQuery);
    setIsActiveSearch(liveResultsMode || !isHomeVariant || nextQuery.trim().length > 0);
  }, [currentView, isHomeVariant, liveResultsMode]);

  const handleClear = useCallback(() => {
    isEditingLiveSearchRef.current = false;
    pendingLiveFocusRestoreQueryRef.current = null;
    lastLiveNavigationQueryRef.current = null;
    setQuery("");
    setIsActiveSearch(false);
    if (liveResultsMode) {
      if (currentView.type === "search") {
        const clearView =
          liveSearchClearView ??
          liveSearchOriginViewRef.current ??
          readStoredLiveSearchOriginView() ??
          { type: "search", query: "" };
        if (clearView.type !== "search") {
          clearStoredLiveSearchOriginView();
        }
        (onReplaceNavigate ?? onNavigate)(
          clearView,
        );
      }
      inputRef.current?.focus();
      return;
    }
    if (isHomeVariant) {
      inputRef.current?.blur();
      return;
    }
    inputRef.current?.focus();
  }, [currentView.type, isHomeVariant, liveResultsMode, liveSearchClearView, onNavigate, onReplaceNavigate]);

  // Static callback to prevent default mousedown behavior
  const preventDefaultMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
      return;
    }

    if (event.key === "Escape") {
      closeSearchMode();
      inputRef.current?.blur();
    }
  }, [closeSearchMode, handleSubmit]);

  const wrapperClassName = containerClassName ?? "mx-auto w-full max-w-3xl px-4 sm:px-6";
  const isCompactHeaderVariant = !isHomeVariant && compact;
  const inputClassName = isHomeVariant
    ? "theme-home-search-input min-h-16 min-w-0 w-full rounded-full pl-8 pr-32 text-base transition-[border-color,background-color,box-shadow,transform] duration-200 md:min-h-[4.5rem] md:pl-10 md:text-xl"
    : isCompactHeaderVariant
      ? "theme-global-search-input min-w-0 w-full rounded-full py-2 pl-4 pr-24 transition-[border-color,background-color,box-shadow,transform] duration-200 placeholder:italic placeholder:opacity-60"
      : "theme-global-search-input min-w-0 w-full rounded-2xl pl-10 pr-16 transition-[border-color,background-color,box-shadow,transform] duration-200 py-3";

  return (
    <div className={wrapperClassName}>
      <div className="relative min-w-0" ref={containerRef}>
        <label htmlFor={inputId} className="sr-only">
          {t("Search the library")}
        </label>
        <Input
          id={inputId}
          name="global-search-query"
          ref={inputRef}
          type="search"
          placeholder={placeholder ?? (compact ? t("Search...") : t("Search the library..."))}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          className={inputClassName}
          value={query}
          onChange={handleChange}
          onPointerDown={handleInputPointerDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {!isHomeVariant && !isCompactHeaderVariant ? (
          <Search
            className="theme-text-secondary pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            size={16}
          />
        ) : null}
          <div
            inert={!clearButtonVisible}
            aria-hidden={!clearButtonVisible}
            className={`absolute top-1/2 flex -translate-y-1/2 items-center transition-opacity duration-[160ms] motion-reduce:transition-none ${
              clearButtonVisible ? "opacity-100" : "pointer-events-none opacity-0"
            } ${
            isHomeVariant
              ? "right-16 md:right-20"
              : isCompactHeaderVariant
                ? "right-12"
                : "right-3.5"
          }`}>
            <button
              type="button"
              disabled={!clearButtonVisible}
              tabIndex={clearButtonVisible ? 0 : -1}
              onMouseDown={preventDefaultMouseDown}
              onClick={handleClear}
              className={`${TOUCH_ICON} theme-focus-ring ${
                isHomeVariant
                  ? "theme-home-search-clear inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                  : isCompactHeaderVariant
                    ? "theme-home-search-clear inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                    : "theme-control-pill-quiet inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,border-color,box-shadow,color,transform] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
              }`}
              aria-label={t("Clear search")}
            >
              <X size={16} />
            </button>
          </div>

        {isHomeVariant || isCompactHeaderVariant ? (
          <div className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-2 ${
            isHomeVariant ? "right-2.5 md:right-3" : "right-0"
          }`}>
            <span aria-hidden="true" className={`theme-home-search-divider w-px ${
              isHomeVariant ? "h-8 md:h-10" : "h-7"
            }`} />
            <button
              type="button"
              onMouseDown={preventDefaultMouseDown}
              onClick={handleSubmit}
              className={`theme-home-search-button theme-focus-ring inline-flex items-center justify-center rounded-full border border-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100 ${
                isHomeVariant ? "h-11 w-11 md:h-12 md:w-12" : "h-11 w-11"
              }`}
              aria-label={t("Search {{name}}", { name: SITE_FLAVOR_CONFIG.name })}
            >
              <Search size={isHomeVariant ? 24 : 18} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
