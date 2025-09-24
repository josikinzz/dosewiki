import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { querySearch, type SearchMatch } from "../../data/search";
import type { AppView } from "../../types/navigation";

const MAX_SUGGESTIONS = 8;

interface GlobalSearchProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export function GlobalSearch({ currentView, onNavigate }: GlobalSearchProps) {
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

  const suggestions = useMemo(() => querySearch(query, MAX_SUGGESTIONS), [query]);
  const hasQuery = query.trim().length > 0;
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="relative" ref={containerRef}>
        <label htmlFor="global-search" className="sr-only">
          Search the library
        </label>
        <input
          id="global-search"
          ref={inputRef}
          type="search"
          placeholder="Search dose.wiki..."
          className="w-full rounded-2xl bg-white/10 px-10 py-3 text-sm text-white/90 placeholder-white/50 ring-1 ring-white/15 transition duration-200 hover:bg-white/12 hover:ring-white/25 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40"
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
        {showSuggestions && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#120d27] shadow-xl shadow-black/50"
          >
            {suggestions.map((match, index) => {
              const optionId = `${listboxId}-option-${index}`;
              const isHighlighted = index === activeIndex;
              return (
                <li key={match.id} role="presentation">
                  <button
                    type="button"
                    id={optionId}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectMatch(match)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition ${
                      isHighlighted
                        ? "bg-white/15 text-white"
                        : "text-white/80 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="mt-0.5 inline-flex min-w-[4.5rem] justify-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                      {renderSuggestionType(match)}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium text-white">{match.label}</span>
                      {match.secondary && (
                        <span className="text-xs text-white/60">{match.secondary}</span>
                      )}
                    </span>
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
