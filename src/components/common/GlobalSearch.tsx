import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { HighlightedText } from "./HighlightedText";
import type { SearchMatch } from "../../data/builders/search";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useListboxPositioning } from "../../hooks/useListboxPositioning";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import { useGlobalSearchSuggestions } from "./useGlobalSearchSuggestions";
import type { AppView } from "../../types/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

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
  const { suggestions, isFetchingSuggestions, clearSuggestions } = useGlobalSearchSuggestions({
    isActiveSearch,
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
  }, []);

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
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    clearSuggestions();
    setIsActiveSearch(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, [clearSuggestions]);

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
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-[1.75rem] bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.12),transparent_58%)] opacity-0 blur-xl transition-opacity duration-300 focus-within:opacity-100" />
        <label htmlFor="global-search" className="sr-only">
          Search the library
        </label>
        <Input
          id="global-search"
          name="global-search-query"
          ref={inputRef}
          type="search"
          placeholder={compact ? "" : "Search the library"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          className={`w-full rounded-2xl pl-10 transition-[border-color,background-color,box-shadow,transform] duration-200 ${
            clearButtonVisible ? "pr-14" : "pr-10"
          } ${compact ? "py-2" : "py-3"} border-white/10 bg-black/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/15 hover:bg-black/20 focus:border-fuchsia-400/30 focus:bg-black/20 focus:shadow-[0_0_0_1px_rgba(232,121,249,0.18),0_18px_45px_-28px_rgba(217,70,239,0.65)]`}
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
        <Search className="theme-text-secondary pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" size={16} />
        {clearButtonVisible && (
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center">
            <Button
              variant="ghost"
              size="icon"
              onMouseDown={preventDefaultMouseDown}
              onClick={handleClear}
              className="h-9 w-9 rounded-full bg-white/[0.04] text-white/70 transition-[background-color,color,transform] duration-200 hover:scale-105 hover:bg-white/[0.08] hover:text-white active:scale-95"
              aria-label="Clear search"
            >
              <X size={16} />
            </Button>
          </div>
        )}
        {showLoadingIndicator && (
          <div className="theme-overlay-surface absolute left-0 right-0 top-full mt-2 rounded-2xl border p-4 shadow-xl ring-1 ring-white/5">
            <div className="flex items-center gap-3">
              <div className="theme-status-orb h-8 w-8 text-sm text-fuchsia-200" data-tone="accent" data-loading="true">
                <span className="theme-status-orb-ring theme-status-orb-ring--outer" />
                <span className="theme-status-orb-ring theme-status-orb-ring--inner" />
                <span className="theme-status-orb-core">
                  <Search size={14} className="theme-status-orb-icon" />
                </span>
              </div>
              <div className="flex flex-col">
                <span className="theme-text-secondary text-sm font-medium">Searching the library…</span>
                <span className="theme-text-faint text-xs">Checking substances, effects, and related classifications.</span>
              </div>
            </div>
          </div>
        )}
        {showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            className={`theme-overlay-surface z-50 max-h-72 overflow-y-scroll rounded-2xl border shadow-xl ring-1 ring-white/5 backdrop-blur-xl [scrollbar-gutter:stable] ${
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
                    <div className="theme-gradient-divider mx-4 my-2 h-px w-auto" />
                  ) : null}
                  <Button
                    variant="ghost"
                    size="auto"
                    className="flex h-auto w-full flex-col items-stretch justify-start gap-1.5 whitespace-normal rounded-xl border border-transparent bg-white/5 px-4 py-3 text-left text-sm transition-[background-color,border-color,transform] duration-200 ring-1 ring-white/10 hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/40 data-[highlighted=true]:border-fuchsia-400/50 data-[highlighted=true]:bg-fuchsia-500/20 data-[highlighted=false]:bg-transparent"
                    id={optionId}
                    role="option"
                    aria-selected={isHighlighted}
                    data-highlighted={isHighlighted}
                    onMouseDown={preventDefaultMouseDown}
                    onClick={() => handleSelectMatch(match)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="theme-text-muted text-[11px] uppercase tracking-[0.28em]">
                        {renderSuggestionType(match)}
                      </span>
                      {index === 0 && hasQuery ? (
                        <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-100">
                          Best match
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <HighlightedText
                        text={match.label}
                        query={query}
                        className="text-base font-semibold text-fuchsia-200"
                        markClassName="bg-white/10 text-white"
                      />
                      {match.secondary && (
                        <HighlightedText
                          text={match.secondary}
                          query={query}
                          className="theme-text-muted line-clamp-2 text-sm leading-relaxed"
                          markClassName="bg-white/10 text-white"
                        />
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
