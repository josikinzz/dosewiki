import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { querySearch, type SearchMatch } from "../../data/search";
import type { AppView } from "../../types/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MAX_SUGGESTIONS = 8;

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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [listboxPosition, setListboxPosition] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const positionRafRef = useRef<number | null>(null);
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

  useEffect(() => {
    const updateViewportFlag = () => {
      if (typeof window === "undefined") {
        return;
      }
      setIsMobileViewport(window.matchMedia("(max-width: 639px)").matches);
    };

    updateViewportFlag();

    window.addEventListener("resize", updateViewportFlag);
    return () => {
      window.removeEventListener("resize", updateViewportFlag);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !showSuggestions) {
      setListboxPosition(null);
      return;
    }

    const GAP_PX = 8; // matches mt-2 spacing between input and results

    const getScrollContainer = () => {
      if (typeof document === "undefined") {
        return null;
      }

      const scoped = containerRef.current?.closest(".app-container")?.querySelector(".app-content");
      if (scoped instanceof HTMLElement) {
        return scoped;
      }

      const fallback = document.querySelector(".app-content");
      return fallback instanceof HTMLElement ? fallback : null;
    };

    const schedulePositionUpdate = () => {
      if (typeof window === "undefined") {
        return;
      }

      if (positionRafRef.current !== null) {
        return;
      }

      positionRafRef.current = window.requestAnimationFrame(() => {
        positionRafRef.current = null;

        if (!containerRef.current || typeof window === "undefined") {
          return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const viewport = window.visualViewport;
        const offsetTop = viewport?.offsetTop ?? 0;
        const offsetLeft = viewport?.offsetLeft ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;

        setListboxPosition({
          top: rect.bottom + GAP_PX + offsetTop,
          left: offsetLeft + viewportWidth / 2,
        });
      });
    };

    const scrollContainer = getScrollContainer();
    const visualViewport = typeof window !== "undefined" ? window.visualViewport : null;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => schedulePositionUpdate())
        : null;

    schedulePositionUpdate();

    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("orientationchange", schedulePositionUpdate);
    scrollContainer?.addEventListener("scroll", schedulePositionUpdate, { passive: true });

    const cleanupViewport: Array<["resize" | "scroll", (event: Event) => void]> = [];
    if (visualViewport) {
      const handleViewportChange = () => schedulePositionUpdate();
      visualViewport.addEventListener("resize", handleViewportChange);
      visualViewport.addEventListener("scroll", handleViewportChange);
      cleanupViewport.push(["resize", handleViewportChange], ["scroll", handleViewportChange]);
    }

    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (positionRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(positionRafRef.current);
        positionRafRef.current = null;
      }

      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("orientationchange", schedulePositionUpdate);
      scrollContainer?.removeEventListener("scroll", schedulePositionUpdate);

      if (visualViewport) {
        cleanupViewport.forEach(([type, handler]) => {
          visualViewport.removeEventListener(type, handler);
        });
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isMobileViewport, showSuggestions]);

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
        const scrollIntoViewIfNeeded = (activeElement as any).scrollIntoViewIfNeeded;
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
    <div className={wrapperClassName}>
      <div className="relative" ref={containerRef}>
        <label htmlFor="global-search" className="sr-only">
          Search the library
        </label>
        <Input
          id="global-search"
          ref={inputRef}
          type="search"
          placeholder="Search..."
          autoComplete="off"
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
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" aria-hidden="true" />
        {clearButtonVisible && (
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center">
            <Button
              variant="default"
              size="icon"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              className="rounded-full"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
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
                    onMouseDown={(event) => event.preventDefault()}
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
