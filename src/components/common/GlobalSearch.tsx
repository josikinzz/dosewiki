import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { querySearchWithData, type SearchMatch } from "../../data/builders/search";
import { useLazyLibrary } from "../../hooks/useLazyLibrary";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useListboxPositioning } from "../../hooks/useListboxPositioning";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import type { AppView } from "../../types/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 200;

interface GlobalSearchProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  containerClassName?: string;
  compact?: boolean;
}

export function GlobalSearch({
  currentView,
  onNavigate,
  containerClassName,
  compact = false,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [isActiveSearch, setIsActiveSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [libraryEnabled, setLibraryEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // Lazy-load library when search is activated
  const { library, isLoading: libraryLoading } = useLazyLibrary(libraryEnabled);

  useEffect(() => {
    if (currentView.type === "search") {
      setQuery(currentView.query);
    } else {
      setQuery("");
    }
    setIsActiveSearch(false);
    setActiveIndex(-1);
  }, [currentView]);

  // Debounce search query to avoid expensive searches on every keystroke
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS);

  const suggestions = useMemo(() => {
    if (!library || !debouncedQuery.trim()) {
      return [];
    }
    return querySearchWithData(debouncedQuery, library, MAX_SUGGESTIONS);
  }, [debouncedQuery, library]);

  const hasQuery = query.trim().length > 0;
  const clearButtonVisible = hasQuery;

  // Memoize derived values to prevent unnecessary re-renders
  const showSuggestions = useMemo(
    () => isActiveSearch && hasQuery && suggestions.length > 0,
    [isActiveSearch, hasQuery, suggestions.length]
  );
  const showLoadingIndicator = useMemo(
    () => libraryEnabled && libraryLoading && hasQuery,
    [libraryEnabled, libraryLoading, hasQuery]
  );

  // Use extracted positioning hook for mobile viewport
  const { position: listboxPosition, isMobile: isMobileViewport } = useListboxPositioning({
    containerRef,
    enabled: showSuggestions,
    gap: 8,
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
  }, [closeSuggestions, onNavigate, query]);

  const handleFocus = useCallback(() => {
    setIsActiveSearch(true);
    // Start loading library on first focus
    if (!libraryEnabled) {
      setLibraryEnabled(true);
    }
  }, [libraryEnabled]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || !containerRef.current?.contains(active)) {
        closeSuggestions();
      }
    });
  }, [closeSuggestions]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setIsActiveSearch(true);
    // Start loading library when user types
    if (!libraryEnabled) {
      setLibraryEnabled(true);
    }
  }, [libraryEnabled]);

  const handleClear = useCallback(() => {
    setQuery("");
    setIsActiveSearch(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  // Static callback to prevent default mousedown behavior
  const preventDefaultMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Handle escape key to blur input
  const handleClose = useCallback(() => {
    closeSuggestions();
    inputRef.current?.blur();
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

  const renderSuggestionType = (match: SearchMatch) => {
    switch (match.type) {
      case "substance":
        return "Substance";
      case "category":
        return "Category";
      case "effect":
        return "Effect";
      default:
        return "";
    }
  };

  const wrapperClassName = containerClassName ?? "mx-auto w-full max-w-3xl px-4 sm:px-6";

  return (
    <div className={wrapperClassName}>
      <div className="relative" ref={containerRef}>
        <label htmlFor="global-search" className="sr-only">
          Search the library
        </label>
        <Input
          id="global-search"
          name="global-search-query"
          ref={inputRef}
          type="search"
          placeholder="Search..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          className={`w-full rounded-2xl pl-10 ${
            clearButtonVisible ? "pr-14" : "pr-10"
          } ${compact ? "py-2" : "py-3"}`}
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
        <Icon icon="lucide:search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" size={16} />
        {clearButtonVisible && (
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center">
            <Button
              variant="default"
              size="icon"
              onMouseDown={preventDefaultMouseDown}
              onClick={handleClear}
              className="rounded-full"
              aria-label="Clear search"
            >
              <Icon icon="lucide:x" size={16} />
            </Button>
          </div>
        )}
        {/* Loading indicator while library loads */}
        {showLoadingIndicator && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-white/10 bg-[#120d27] p-4 shadow-xl shadow-black/50">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
              <span className="text-sm text-white/60">Loading search...</span>
            </div>
          </div>
        )}
        {showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            className={`z-50 max-h-72 overflow-y-scroll rounded-2xl border border-white/10 bg-[#120d27] shadow-xl shadow-black/50 [scrollbar-gutter:stable] ${
              isMobileViewport
                ? "fixed left-1/2 max-w-[calc(100vw-1.5rem)] w-[min(98vw,calc(100vw-1.5rem))] -translate-x-1/2"
                : "absolute left-0 right-0 top-full mt-2"
            }`}
            style={
              isMobileViewport && listboxPosition
                ? { top: listboxPosition.top, left: listboxPosition.left }
                : undefined
            }
          >
            {suggestions.map((match, index) => {
              const optionId = `${listboxId}-option-${index}`;
              const isHighlighted = index === activeIndex;
              return (
                <li key={match.id} role="presentation">
                  {index > 0 ? (
                    <div className="mx-4 my-2 h-px w-auto bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_20%,rgba(255,255,255,0.12)_80%,rgba(255,255,255,0)_100%)]" />
                  ) : null}
                  <Button
                    variant="searchOption"
                    className="!h-auto"
                    id={optionId}
                    role="option"
                    aria-selected={isHighlighted}
                    data-highlighted={isHighlighted}
                    onMouseDown={preventDefaultMouseDown}
                    onClick={() => handleSelectMatch(match)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="text-[10px] uppercase tracking-[0.32em] text-white/55">
                      {renderSuggestionType(match)}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold text-fuchsia-200">{match.label}</span>
                      {match.secondary && (
                        <span className="line-clamp-2 text-xs leading-relaxed text-white/50">{match.secondary}</span>
                      )}
                    </div>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
