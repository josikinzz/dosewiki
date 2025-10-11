import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { querySearch, type SearchMatch } from "../../data/search";
import type { AppView } from "../../types/navigation";

const MAX_SUGGESTIONS = 8;

const META_TOKEN_SPLIT = /[·,/]/;

function extractMetaTokens(meta?: SearchMatch["meta"]): string[] {
  if (!meta) {
    return [];
  }

  const tokens = new Set<string>();
  meta.forEach((entry) => {
    entry.value
      .split(META_TOKEN_SPLIT)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .forEach((token) => tokens.add(token));
  });

  return Array.from(tokens);
}

interface GlobalSearchProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  containerClassName?: string;
  onRootReady?: (element: HTMLDivElement | null) => void;
  compact?: boolean;
}

export function GlobalSearch({
  currentView,
  onNavigate,
  containerClassName,
  onRootReady,
  compact = false,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [isActiveSearch, setIsActiveSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleWrapperRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (onRootReady) {
      onRootReady(node);
    }
  }, [onRootReady]);

  useEffect(() => {
    return () => {
      if (onRootReady) {
        onRootReady(null);
      }
    };
  }, [onRootReady]);

  useEffect(() => {
    if (currentView.type === "search") {
      setQuery(currentView.query);
    } else {
      setQuery("");
    }
    setIsActiveSearch(false);
    setActiveIndex(-1);
  }, [currentView]);

  const suggestions = useMemo(() => querySearch(query, MAX_SUGGESTIONS), [query]);
  const hasQuery = query.trim().length > 0;
  const clearButtonVisible = hasQuery;
  const showSuggestions = isActiveSearch && hasQuery && suggestions.length > 0;

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(suggestions.length > 0 ? suggestions.length - 1 : -1);
    }
  }, [activeIndex, suggestions.length]);

  const closeSuggestions = useCallback(() => {
    setIsActiveSearch(false);
    setActiveIndex(-1);
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
    setIsActiveSearch(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!showSuggestions && suggestions.length > 0) {
          setIsActiveSearch(true);
          setActiveIndex(0);
          return;
        }
        setActiveIndex((prev) => {
          if (suggestions.length === 0) {
            return -1;
          }
          const next = prev + 1;
          return next >= suggestions.length ? 0 : next;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!showSuggestions && suggestions.length > 0) {
          setIsActiveSearch(true);
          setActiveIndex(suggestions.length - 1);
          return;
        }
        setActiveIndex((prev) => {
          if (suggestions.length === 0) {
            return -1;
          }
          const next = prev - 1;
          return next < 0 ? suggestions.length - 1 : next;
        });
        return;
      }

      if (event.key === "Enter") {
        if (showSuggestions && activeIndex >= 0 && suggestions[activeIndex]) {
          event.preventDefault();
          handleSelectMatch(suggestions[activeIndex]);
          return;
        }
        event.preventDefault();
        handleSubmit();
        return;
      }

      if (event.key === "Escape") {
        closeSuggestions();
        inputRef.current?.blur();
      }
    },
    [activeIndex, closeSuggestions, handleSelectMatch, handleSubmit, showSuggestions, suggestions],
  );

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
    <div ref={handleWrapperRef} className={wrapperClassName}>
      <div className="relative" ref={containerRef}>
        <label htmlFor="global-search" className="sr-only">
          Search the library
        </label>
        <input
          id="global-search"
          ref={inputRef}
          type="text"
          placeholder="Search..."
          className={`w-full rounded-2xl bg-white/10 pl-10 ${
            clearButtonVisible ? "pr-14" : "pr-10"
          } text-sm text-white/90 placeholder-white/50 ring-1 ring-white/15 transition duration-200 hover:bg-white/12 hover:ring-white/25 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40 ${
            compact ? "py-2" : "py-3"
          }`}
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
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" aria-hidden="true" />
        {clearButtonVisible && (
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200/80 transition hover:border-fuchsia-300/70 hover:bg-fuchsia-500/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-scroll rounded-2xl border border-white/10 bg-[#120d27] shadow-xl shadow-black/50 [scrollbar-gutter:stable]"
          >
            {suggestions.map((match, index) => {
              const optionId = `${listboxId}-option-${index}`;
              const isHighlighted = index === activeIndex;
              return (
                <li key={match.id} role="presentation">
                  {index > 0 ? (
                    <div className="mx-4 my-2 h-px w-auto bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_20%,rgba(255,255,255,0.12)_80%,rgba(255,255,255,0)_100%)]" />
                  ) : null}
                  <button
                    type="button"
                    id={optionId}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectMatch(match)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left text-sm transition ${
                      isHighlighted
                        ? "bg-[rgba(255,255,255,0.18)] text-white"
                        : "text-white/80 hover:bg-[rgba(255,255,255,0.08)] hover:text-white/90"
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-[0.32em] text-white/55">
                      {renderSuggestionType(match)}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-base font-semibold text-fuchsia-200">{match.label}</span>
                      {match.secondary && (
                        <span className="text-xs text-white/65">{match.secondary}</span>
                      )}
                      {(() => {
                        const tokens = extractMetaTokens(match.meta);
                        if (tokens.length === 0) {
                          return null;
                        }
                        return (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {tokens.map((token) => (
                              <span
                                key={`${match.id}-badge-${token}`}
                                className="inline-flex items-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-fuchsia-200/90"
                              >
                                {token}
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
