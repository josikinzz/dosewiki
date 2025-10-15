# Global Search Interaction Report

## Portal and Layout Orchestration
- `App` tracks whether the page has scrolled beyond 70px and retargets the single `GlobalSearch` instance into the header slot or the hero well accordingly (`isSearchInHeader`, `searchTarget`).

```tsx
// src/App.tsx
const [isSearchInHeader, setIsSearchInHeader] = useState(false);
const [topSearchContainer, setTopSearchContainer] = useState<HTMLDivElement | null>(null);
const [headerSearchContainer, setHeaderSearchContainer] = useState<HTMLDivElement | null>(null);
const [searchTarget, setSearchTarget] = useState<HTMLDivElement | null>(null);
...
{searchTarget &&
  createPortal(
    <GlobalSearch
      currentView={view}
      onNavigate={navigate}
      containerClassName={searchContainerClassName}
      compact={isSearchTargetInHeader}
      onRootReady={storeSearchRoot}
    />,
    searchTarget,
  )}
```

- When the search lives in the hero, `topSearchWrapperClassName` reserves height using a measured `reservedTopSearchHeight` to prevent layout jumps during portal moves (`src/App.tsx`).
- The header exposes a dedicated drop point (`ref={onSearchSlotChange}`) so the search can ride inside the nav bar while honoring the sticky positioning and blend with the compact spacing (`src/components/layout/Header.tsx`).

## Search Input State Machine
- `GlobalSearch` keeps local state for the query, suggestion visibility, highlighted index, and a mobile viewport flag (`src/components/common/GlobalSearch.tsx`).
- Searches rehydrate when the router enters `#/search/<query>` so direct hash navigation carries the term back into the input.

```tsx
// src/components/common/GlobalSearch.tsx
const [query, setQuery] = useState("");
const [isActiveSearch, setIsActiveSearch] = useState(false);
const [activeIndex, setActiveIndex] = useState(-1);
const [isMobileViewport, setIsMobileViewport] = useState(false);
const suggestions = useMemo(() => querySearch(query, MAX_SUGGESTIONS), [query]);
```

- The component toggles `isActiveSearch` on focus/change, hides results on blur (unless focus stays inside the container), and supports full keyboard control (↑/↓ cycling, <kbd>Enter</kbd> submit/select, <kbd>Escape</kbd> close).

```tsx
const handleKeyDown = useCallback((event) => {
  if (event.key === "ArrowDown") { ... }
  if (event.key === "ArrowUp") { ... }
  if (event.key === "Enter") {
    if (showSuggestions && activeIndex >= 0) {
      handleSelectMatch(suggestions[activeIndex]);
      return;
    }
    handleSubmit();
  }
  if (event.key === "Escape") {
    closeSuggestions();
    inputRef.current?.blur();
  }
}, [activeIndex, showSuggestions, suggestions]);
```

- `handleSelectMatch` dispatches navigation intents back up to the router for substances, categories, effects, and clears the input afterward to keep the field ready for the next query.

## Pop-out Suggestion Panel
- Suggestions only render when `isActiveSearch` is `true`, the trimmed query is non-empty, and results exist.
- Each option is a button for consistent keyboard and pointer interaction; badges are built from `SearchMatch.meta` tokens so the UI mirrors metadata computed in the search index.

```tsx
<ul
  id={listboxId}
  role="listbox"
  className={`z-50 max-h-72 overflow-y-scroll rounded-2xl border border-white/10 bg-[#120d27] shadow-xl shadow-black/50 [scrollbar-gutter:stable] ${
    isMobileViewport
      ? "fixed left-1/2 w-[min(98vw,calc(100vw-1.5rem))] -translate-x-1/2"
      : "absolute left-0 right-0 top-full mt-2"
  }`}
  style={
    isMobileViewport && listboxPosition
      ? { top: listboxPosition.top, left: listboxPosition.left }
      : undefined
  }
>
  {suggestions.map((match, index) => (
    <li key={match.id} role="presentation">
      <button
        type="button"
        id={`${listboxId}-option-${index}`}
        role="option"
        aria-selected={index === activeIndex}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => handleSelectMatch(match)}
        onMouseEnter={() => setActiveIndex(index)}
        className={...}
      >
        ...
      </button>
    </li>
  ))}
</ul>
```

- Pointer guards (`onMouseDown={(event) => event.preventDefault()}`) stop focus from leaving the input while clicking, so the panel does not dismiss mid-selection.
- Visual highlights lift the active item and insert a gradient divider between rows for readability.

## Mobile Layout Adjustments
- A dedicated `matchMedia("(max-width: 639px)")` listener toggles `isMobileViewport`, driving two behaviors:
  1. The result list “pops out” into a centered, fixed-position sheet sized to ~98vw with `translateX(-50%)` so it floats above content instead of sliding under the sticky header.
  2. The component tracks `listboxPosition` (top + horizontal center) on resize/scroll to keep the sheet anchored to the input even as the page moves.

```tsx
useEffect(() => {
  const updateViewportFlag = () => {
    setIsMobileViewport(window.matchMedia("(max-width: 639px)").matches);
  };
  updateViewportFlag();
  window.addEventListener("resize", updateViewportFlag);
  return () => window.removeEventListener("resize", updateViewportFlag);
}, []);

useEffect(() => {
  if (!isMobileViewport || !showSuggestions) {
    setListboxPosition(null);
    return;
  }
  const updatePosition = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setListboxPosition({ top: rect.bottom + 8, left: window.innerWidth / 2 });
  };
  updatePosition();
  window.addEventListener("resize", updatePosition);
  window.addEventListener("scroll", updatePosition, { passive: true });
  return () => {
    window.removeEventListener("resize", updatePosition);
    window.removeEventListener("scroll", updatePosition);
  };
}, [isMobileViewport, showSuggestions]);
```

- When the search resides in the header, the `compact` prop trims vertical padding (`py-2`) to fit the tighter toolbar.
- `searchContainerClassName` fades the field between hero and header placements to hide the portal switch and turn pointer events off while the component is in-flight on mobile.

## Search Index and Metadata
- Results come from `src/data/search.ts`, which builds three entry pools (substances, psychoactive/chemical category groups, and effect summaries) and normalizes keywords.

```ts
const entryPool: SearchEntry[] = [...substanceEntries, ...categoryEntries, ...effectEntries];
const withLabelKeywords = entryPool.map((entry) => ({
  ...entry,
  keywords: mergeKeywords(entry.keywords, keywordize(entry.label)),
  labelLower: entry.label.toLowerCase(),
}));

export function querySearch(query: string, limit?: number): SearchMatch[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const matches: SearchMatch[] = [];
  withLabelKeywords.forEach((entry) => {
    const score = computeScore(entry, normalized);
    if (score === null) return;
    matches.push({ ...entry, score });
  });
  matches.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.type !== b.type) return order[a.type] - order[b.type];
    if (a.count && b.count && a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
  return typeof limit === "number" ? matches.slice(0, Math.max(limit, 0)) : matches;
}
```

- `extractMechanismInfo` walks article info sections to promote mechanism chips into keyword sources, so the pop-out badges surface chip text (mechanisms, classes, aliases) without hardcoding UI strings.
- Category entries reuse their aggregated counts (`group.total`) which display in the secondary row (`X substances`) under each suggestion.

## Interaction and Accessibility Notes
- The input is fully labelled via `aria-autocomplete`, `aria-expanded`, `aria-controls`, and dynamic `aria-activedescendant` attributes so screen readers narrate the pop-out.
- The clear button uses the `X` icon with focus rings and preserves input focus by preventing default `mousedown` blur.
- Keyboard navigation loops through the result set and resets highlight indices if results shrink (guarded in `useEffect` watching `suggestions.length`).
- `requestAnimationFrame` inside `handleBlur` waits for focus to settle before closing, allowing option clicks to complete when tabbing with assistive tech.

Together these pieces produce a single, data-driven search surface that gracefully rehomes between hero and header contexts, pops out into a modal-like sheet on small screens, and keeps navigation + accessibility intact across viewports.
