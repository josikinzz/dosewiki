import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { HighlightedText } from "./HighlightedText";
import { Icon, type IconName } from "./Icon";
import type { SearchMatch } from "../../data/builders/search";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useListboxPositioning } from "../../hooks/useListboxPositioning";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import { useGlobalSearchSuggestions } from "./useGlobalSearchSuggestions";
import type { AppView } from "../../types/navigation";
import { Input } from "@/components/ui/input";
import { icons } from "@/utils/iconNames";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;
const DEBOUNCE_MS = 200;
const LIVE_SEARCH_ORIGIN_STORAGE_KEY = "dosewiki-live-search-origin-view";

interface GlobalSearchProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onReplaceNavigate?: (view: AppView) => void;
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

export function GlobalSearch({
  currentView,
  onNavigate,
  onReplaceNavigate,
  containerClassName,
  compact = false,
  liveResultsMode = false,
  liveSearchClearView = null,
  onSearchModeChange,
  placeholder,
  variant = "default",
}: GlobalSearchProps) {
  const [query, setQuery] = useState(() => currentView.type === "search" ? currentView.query : "");
  const [isActiveSearch, setIsActiveSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingLiveNavigationRef = useRef(false);
  const liveSearchOriginViewRef = useRef<AppView | null>(null);
  const inputId = useId();
  const overlayInputId = useId();
  const listboxId = useId();

  useEffect(() => {
    if (currentView.type === "search") {
      setQuery(currentView.query);
    } else {
      setQuery("");
      liveSearchOriginViewRef.current = currentView;
      if (liveResultsMode) {
        writeStoredLiveSearchOriginView(currentView);
      }
    }
    setIsActiveSearch(false);
    setActiveIndex(-1);
  }, [currentView, liveResultsMode]);

  // Debounce search query to avoid expensive searches on every keystroke
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);
  const shouldFetchSuggestions = !liveResultsMode && isActiveSearch;
  const { suggestions, isFetchingSuggestions, clearSuggestions } = useGlobalSearchSuggestions({
    isActiveSearch: shouldFetchSuggestions,
    query: debouncedQuery,
  });

  const hasQuery = query.trim().length > 0;
  const clearButtonVisible = hasQuery;

  // Memoize derived values to prevent unnecessary re-renders
  const showSuggestions = useMemo(
    () => isActiveSearch && hasQuery && suggestions.length > 0,
    [isActiveSearch, hasQuery, suggestions.length]
  );
  const showLoadingIndicator = useMemo(
    () => isFetchingSuggestions && hasQuery,
    [isFetchingSuggestions, hasQuery]
  );
  const isHomeVariant = variant === "home";
  const isSearchMode = isActiveSearch && hasQuery;
  const isHomeSearchMode = isHomeVariant && isActiveSearch;

  useEffect(() => {
    onSearchModeChange?.(isHomeVariant ? isHomeSearchMode : isSearchMode);
  }, [isHomeSearchMode, isHomeVariant, isSearchMode, onSearchModeChange]);

  useEffect(() => {
    if (!liveResultsMode) {
      return;
    }

    const trimmed = debouncedQuery.trim();
    if (!trimmed && currentView.type !== "search") {
      return;
    }

    if (currentView.type !== "search" && !pendingLiveNavigationRef.current) {
      return;
    }

    if (currentView.type === "search" && currentView.query.trim() === trimmed) {
      return;
    }

    const nextView = { type: "search", query: trimmed } satisfies AppView;
    const navigate = currentView.type === "search" ? onReplaceNavigate ?? onNavigate : onNavigate;
    pendingLiveNavigationRef.current = false;
    navigate(nextView);
  }, [currentView.type, debouncedQuery, liveResultsMode, onNavigate, onReplaceNavigate]);

  // Use extracted positioning hook for mobile viewport
  const { position: listboxPosition, isMobile: isMobileViewport } = useListboxPositioning({
    containerRef,
    enabled: showSuggestions || showLoadingIndicator,
    gap: 8,
    bottomInset: variant === "home" ? 73 : 24,
    mobileBottomInset: variant === "home" ? 98 : undefined,
  });

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(suggestions.length > 0 ? suggestions.length - 1 : -1);
    }
  }, [activeIndex, suggestions.length]);

  const closeSuggestions = useCallback(() => {
    setIsActiveSearch(false);
    setActiveIndex(-1);
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

  const handleSelectMatch = useCallback(
    (match: SearchMatch) => {
      setQuery("");
      closeSuggestions();
      inputRef.current?.blur();
      overlayInputRef.current?.blur();

      switch (match.type) {
        case "substance":
          onNavigate({ type: "substance", slug: match.slug });
          break;
        case "category":
          onNavigate({ type: "category", categoryKey: match.slug });
          break;
        case "effect":
          onNavigate({ type: "effect", effectSlug: match.slug });
          break;
        case "report":
          onNavigate({ type: "report", slug: match.slug });
          break;
        case "profile":
          onNavigate({ type: "contributor", profileKey: match.slug });
          break;
        default:
          break;
      }
    },
    [closeSuggestions, onNavigate],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    closeSuggestions();
    onNavigate({ type: "search", query: trimmed });
    inputRef.current?.blur();
    overlayInputRef.current?.blur();
  }, [closeSuggestions, onNavigate, query]);

  const handleFocus = useCallback(() => {
    setIsActiveSearch(true);
  }, []);

  const handleInputPointerDown = useCallback(() => {
    if (isHomeVariant) {
      setIsActiveSearch(true);
    }
  }, [isHomeVariant]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const isInsideSearch =
        (containerRef.current?.contains(active) ?? false) ||
        (overlayContainerRef.current?.contains(active) ?? false);
      if (!active || !isInsideSearch) {
        closeSuggestions();
      }
    });
  }, [closeSuggestions]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    if (liveResultsMode) {
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
    setQuery("");
    clearSuggestions();
    setIsActiveSearch(false);
    setActiveIndex(-1);
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
  }, [clearSuggestions, currentView.type, isHomeVariant, liveResultsMode, liveSearchClearView, onNavigate, onReplaceNavigate]);

  // Static callback to prevent default mousedown behavior
  const preventDefaultMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Handle escape key to blur input
  const handleClose = useCallback(() => {
    closeSuggestions();
    inputRef.current?.blur();
    overlayInputRef.current?.blur();
  }, [closeSuggestions]);

  // Use extracted keyboard navigation hook
  const { handleKeyDown } = useKeyboardNavigation({
    items: suggestions,
    activeIndex,
    setActiveIndex,
    onSelect: handleSelectMatch,
    onSubmit: handleSubmit,
    onClose: handleClose,
    enabled: suggestions.length > 0,
    isShowingPanel: showSuggestions,
  });

  const getSuggestionIcon = (match: SearchMatch): IconName => {
    switch (match.type) {
      case "substance":
        return SUBSTANCE_INDEX_ICON;
      case "category":
        return match.icon ?? "lucide:layers";
      case "effect":
        return icons.subjectiveEffectIndex;
      case "report":
        return match.icon ?? icons.fileSignature;
      case "profile":
        return "lucide:user";
      default:
        return "lucide:search";
    }
  };

  const getAliasPreview = (match: SearchMatch) =>
    match.type === "report"
      ? match.secondary ?? ""
      : (match.type === "substance" || match.type === "profile") && match.aliases && match.aliases.length > 0
        ? match.aliases.slice(0, 4).join(" · ")
        : "";

  const getDescriptionText = (match: SearchMatch) =>
    match.type === "report" ? match.description : match.description ?? match.secondary;

  const wrapperClassName = containerClassName ?? "mx-auto w-full max-w-3xl px-4 sm:px-6";
  const isCompactHeaderVariant = !isHomeVariant && compact;
  const showSiteSearchOverlay = !liveResultsMode && !isHomeVariant && compact && isSearchMode;
  const panelMaxHeight = listboxPosition?.maxHeight;
  const inputClassName = isHomeVariant
    ? `theme-home-search-input min-h-16 min-w-0 w-full rounded-full pl-8 text-base transition-[border-color,background-color,box-shadow,transform] duration-200 ${
        clearButtonVisible ? "pr-32" : "pr-24"
      } md:min-h-[4.5rem] md:pl-10 md:text-xl`
    : isCompactHeaderVariant
      ? `theme-global-search-input min-w-0 w-full rounded-full py-2 pl-4 transition-[border-color,background-color,box-shadow,transform] duration-200 placeholder:italic placeholder:opacity-60 ${
          clearButtonVisible ? "pr-24" : "pr-16"
        }`
    : `theme-global-search-input min-w-0 w-full rounded-2xl pl-10 transition-[border-color,background-color,box-shadow,transform] duration-200 ${
        clearButtonVisible ? "pr-14" : "pr-10"
      } py-3`;
  const overlayInputClassName = `theme-home-search-input min-h-[3.25rem] min-w-0 w-full rounded-full pl-8 text-base transition-[border-color,background-color,box-shadow,transform] duration-200 ${
    clearButtonVisible ? "pr-32" : "pr-24"
  }`;

  useEffect(() => {
    if (!showSiteSearchOverlay) return;

    const frame = window.requestAnimationFrame(() => {
      overlayInputRef.current?.focus();
      overlayInputRef.current?.setSelectionRange(query.length, query.length);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [query.length, showSiteSearchOverlay]);

  const renderSuggestionItems = () =>
    suggestions.map((match, index) => {
      const optionId = `${listboxId}-option-${index}`;
      const isHighlighted = index === activeIndex;
      const aliasPreview = getAliasPreview(match);
      const descriptionText = getDescriptionText(match);
      return (
        <li key={match.id} role="presentation">
          {index > 0 ? (
            <div className="theme-search-result-divider mx-4 my-1.5 h-px w-auto" />
          ) : null}
          <button
            type="button"
            className="theme-search-suggestion flex h-auto w-full flex-col items-stretch justify-start gap-2.5 whitespace-normal rounded-xl border border-transparent bg-transparent px-4 py-4 text-left text-sm transition-[background-color,border-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 sm:px-5"
            id={optionId}
            role="option"
            aria-selected={isHighlighted}
            data-highlighted={isHighlighted}
            onMouseDown={preventDefaultMouseDown}
            onClick={() => handleSelectMatch(match)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="theme-search-suggestion-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                <Icon icon={getSuggestionIcon(match)} size={16} />
              </span>
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <HighlightedText
                  text={match.label}
                  query={query}
                  className="theme-search-suggestion-title shrink-0 text-base font-semibold leading-6"
                  markClassName="theme-search-highlight-mark"
                />
                {aliasPreview ? (
                  <HighlightedText
                    text={aliasPreview}
                    query={query}
                    className="theme-search-suggestion-aliases min-w-0 truncate text-[0.6875rem] font-medium leading-4"
                    markClassName="theme-search-highlight-mark"
                  />
                ) : null}
              </div>
              {index === 0 && hasQuery ? (
                <span
                  className="theme-search-best-match hidden h-7 w-7 shrink-0 items-center justify-center rounded-full sm:inline-flex"
                  aria-label="Best match"
                  title="Best match"
                >
                  <Icon icon="lucide:star" size={14} aria-hidden="true" />
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 pl-9">
              {descriptionText && (
                <HighlightedText
                  text={descriptionText}
                  query={query}
                  className="theme-search-suggestion-secondary line-clamp-2 text-[0.8125rem] leading-5"
                  markClassName="theme-search-highlight-mark"
                />
              )}
            </div>
          </button>
        </li>
      );
    });

  const siteSearchOverlay =
    showSiteSearchOverlay && typeof document !== "undefined"
      ? createPortal(
          <div className="theme-site-search-layer fixed inset-0 z-[80] pointer-events-none">
            <div
              ref={overlayContainerRef}
              className="theme-site-search-panel pointer-events-auto mx-auto flex w-full max-w-[62rem] flex-col px-4 sm:px-6"
            >
              <div className="theme-site-search-row flex w-full items-center gap-2.5">
                <img
                  src="/dosewiki-logo.png"
                  alt=""
                  width={52}
                  height={52}
                  aria-hidden="true"
                  className="theme-home-logo theme-site-search-logo h-[3.25rem] w-[3.25rem] shrink-0"
                  draggable={false}
                />
                <div className="relative min-w-0 flex-1">
                  <div className="theme-search-focus-glow pointer-events-none absolute inset-0 -z-10 rounded-full opacity-100 blur-xl" />
                  <label htmlFor={overlayInputId} className="sr-only">
                    Search the library
                  </label>
                  <Input
                    id={overlayInputId}
                    name="global-search-query-overlay"
                    ref={overlayInputRef}
                    type="search"
                    placeholder={placeholder ?? "Search..."}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-form-type="other"
                    data-lpignore="true"
                    className={overlayInputClassName}
                    value={query}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions}
                    aria-controls={showSuggestions ? listboxId : undefined}
                    aria-activedescendant={
                      showSuggestions && activeIndex >= 0
                        ? `${listboxId}-option-${activeIndex}`
                        : undefined
                    }
                  />
                  {clearButtonVisible && (
                    <div className="absolute right-16 top-1/2 flex -translate-y-1/2 items-center">
                      <button
                        type="button"
                        onMouseDown={preventDefaultMouseDown}
                        onClick={handleClear}
                        className="theme-home-search-clear inline-flex h-9 w-9 items-center justify-center rounded-full hover:scale-105 active:scale-95"
                        aria-label="Clear search"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
                    <span aria-hidden="true" className="theme-home-search-divider h-8 w-px" />
                    <button
                      type="button"
                      onMouseDown={preventDefaultMouseDown}
                      onClick={handleSubmit}
                      className="theme-home-search-button inline-flex h-10 w-10 items-center justify-center rounded-full hover:scale-105 focus-visible:outline-none focus-visible:ring-2 active:scale-95"
                      aria-label="Search dose.wiki"
                    >
                      <Search size={22} />
                    </button>
                  </div>
                </div>
              </div>
              {showLoadingIndicator && (
                <div className="theme-overlay-surface theme-search-overlay theme-site-search-overlay mt-3 rounded-2xl border p-4 shadow-xl ring-1">
                  <div className="flex items-center gap-3.5">
                    <div className="theme-status-orb theme-accent-emphasis h-8 w-8 text-sm" data-tone="accent" data-loading="true">
                      <span className="theme-status-orb-ring theme-status-orb-ring--outer" />
                      <span className="theme-status-orb-ring theme-status-orb-ring--inner" />
                      <span className="theme-status-orb-core">
                        <Search size={14} className="theme-status-orb-icon" />
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="theme-text-secondary text-sm font-medium">Searching the library…</span>
                      <span className="theme-text-muted text-xs leading-5">Checking substances, effects, reports, and profiles.</span>
                    </div>
                  </div>
                </div>
              )}
              {showSuggestions && (
                <ul
                  id={listboxId}
                  role="listbox"
                  className="theme-overlay-surface theme-search-overlay theme-site-search-overlay mt-3 overflow-y-auto rounded-2xl border p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl"
                >
                  {renderSuggestionItems()}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
    <div className={wrapperClassName}>
      <div className="relative min-w-0" ref={containerRef}>
        <div className={`theme-search-focus-glow pointer-events-none absolute inset-0 -z-10 opacity-0 blur-xl transition-opacity duration-300 focus-within:opacity-100 ${isHomeVariant ? "rounded-full" : "rounded-[1.75rem]"}`} />
        <label htmlFor={inputId} className="sr-only">
          Search the library
        </label>
        <Input
          id={inputId}
          name="global-search-query"
          ref={inputRef}
          type="search"
          placeholder={placeholder ?? (compact ? "Search..." : "Search the library...")}
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
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-activedescendant={
            showSuggestions && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
        />
        {!isHomeVariant && !isCompactHeaderVariant ? (
          <Search
            className="theme-text-secondary pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            size={16}
          />
        ) : null}
        {clearButtonVisible && (
          <div className={`absolute top-1/2 flex -translate-y-1/2 items-center ${
            isHomeVariant
              ? "right-16 md:right-20"
              : isCompactHeaderVariant
                ? "right-12"
                : "right-3.5"
          }`}>
            <button
              type="button"
              onMouseDown={preventDefaultMouseDown}
              onClick={handleClear}
              className={`${
                isHomeVariant
                  ? "theme-home-search-clear inline-flex h-10 w-10 items-center justify-center rounded-full hover:scale-105 active:scale-95"
                  : isCompactHeaderVariant
                    ? "theme-home-search-clear inline-flex h-8 w-8 items-center justify-center rounded-full hover:scale-105 active:scale-95"
                    : "theme-control-pill-quiet inline-flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:scale-105 active:scale-95"
              }`}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {isHomeVariant || isCompactHeaderVariant ? (
          <div className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-2 ${
            isHomeVariant ? "right-2.5 md:right-3" : "right-2"
          }`}>
            <span aria-hidden="true" className={`theme-home-search-divider w-px ${
              isHomeVariant ? "h-8 md:h-10" : "h-7"
            }`} />
            <button
              type="button"
              onMouseDown={preventDefaultMouseDown}
              onClick={handleSubmit}
              className={`theme-home-search-button inline-flex items-center justify-center rounded-full hover:scale-105 focus-visible:outline-none focus-visible:ring-2 active:scale-95 ${
                isHomeVariant ? "h-11 w-11 md:h-12 md:w-12" : "h-8 w-8"
              }`}
              aria-label="Search dose.wiki"
            >
              <Search size={isHomeVariant ? 24 : 18} />
            </button>
          </div>
        ) : null}
        {!showSiteSearchOverlay && showLoadingIndicator && (
          <div
            className={`theme-overlay-surface theme-search-overlay z-50 rounded-2xl border p-4 shadow-xl ring-1 ${
              isMobileViewport
                ? "fixed inset-x-4"
                : "absolute left-0 right-0 top-full mt-3"
            }`}
            style={
              listboxPosition
                ? {
                    ...(isMobileViewport
                      ? { top: listboxPosition.top }
                      : null),
                    maxHeight: panelMaxHeight,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-3.5">
              <div className="theme-status-orb theme-accent-emphasis h-8 w-8 text-sm" data-tone="accent" data-loading="true">
                <span className="theme-status-orb-ring theme-status-orb-ring--outer" />
                <span className="theme-status-orb-ring theme-status-orb-ring--inner" />
                <span className="theme-status-orb-core">
                  <Search size={14} className="theme-status-orb-icon" />
                </span>
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="theme-text-secondary text-sm font-medium">Searching the library…</span>
                <span className="theme-text-muted text-xs leading-5">Checking substances, effects, reports, and profiles.</span>
              </div>
            </div>
          </div>
        )}
        {!showSiteSearchOverlay && showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            className={`theme-overlay-surface theme-search-overlay z-50 overflow-y-auto rounded-2xl border p-2 pr-3 shadow-xl ring-1 backdrop-blur-xl ${
              isMobileViewport
                ? "fixed inset-x-4"
                : "absolute left-0 right-0 top-full mt-3"
            }`}
            style={
              listboxPosition
                ? {
                    ...(isMobileViewport
                      ? { top: listboxPosition.top }
                      : null),
                    maxHeight: panelMaxHeight,
                  }
                : undefined
            }
          >
            {renderSuggestionItems()}
          </ul>
        )}
      </div>
    </div>
    {siteSearchOverlay}
    </>
  );
}
