# Header Menu & Sticky Behavior Report

## Component Overview
The header lives in `src/components/layout/Header.tsx` and renders the brand, global navigation, search slot, and responsive menu toggle. Key imports and props:

```tsx
// src/components/layout/Header.tsx
import { useEffect, useRef, useState } from "react";
import { FlaskConical, Info, Menu, Sparkles, Wrench, X } from "lucide-react";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { AppView } from "../../types/navigation";
import { viewToHash } from "../../utils/routing";

interface HeaderProps {
  currentView: AppView;
  defaultSlug: string;
  onNavigate: (view: AppView) => void;
  onSearchSlotChange?: (element: HTMLDivElement | null) => void;
}
```

The component pre-computes `AppView` targets for the major routes and exposes `isActive` helpers so each nav entry highlights when its underlying router view matches.

## Sticky Container & Visual Treatment
The outer `<header>` applies Tailwind’s sticky positioning, ensuring the element pins to the viewport top while inheriting the page’s gradient background via a semi-opaque surface and blur.

```tsx
return (
  <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0a1f]/70 backdrop-blur">
    <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
      ...
    </div>
  </header>
);
```

- `sticky top-0`: the header scrolls with the page until it reaches the top offset (0 px), then sticks in place.
- `z-50`: keeps the bar above hero effects, pop-outs, and mobile drawers.
- `bg-[#0f0a1f]/70` + `backdrop-blur`: create a translucent veneer so underlying gradients stay visible while text remains legible.
- `border-b border-white/10`: anchors the header visually when the hero content scrolls underneath.

The inner flex wrapper constrains width to 6xl (≈72rem) and spaces items for both desktop and mobile compositions.

## Search Slot Integration
`App.tsx` portals a single `GlobalSearch` instance into whichever container the header (or hero) exposes. The header’s middle column is simply a div with a ref supplied by `onSearchSlotChange` so `App` can mount the search input directly inside the sticky bar when the user scrolls.

```tsx
<div className="flex flex-1 min-w-0 items-center min-h-[44px]">
  <div
    ref={onSearchSlotChange}
    className="w-full"
  />
</div>
```

When the search is portaled into this slot, `App` passes `compact` to shrink padding and `searchContainerClassName` to animate opacity. The surrounding flex ensures the field stretches to remaining width while brand and nav sections keep their footprint.

Supporting logic in `src/App.tsx` tracks scroll position and retargets the portal:

```tsx
// src/App.tsx
const [isSearchInHeader, setIsSearchInHeader] = useState(false);
const [headerSearchContainer, setHeaderSearchContainer] = useState<HTMLDivElement | null>(null);
const [searchTarget, setSearchTarget] = useState<HTMLDivElement | null>(null);

useEffect(() => {
  const handleScroll = () => {
    setIsSearchInHeader(window.scrollY > 70);
  };
  handleScroll();
  window.addEventListener("scroll", handleScroll, { passive: true });
  return () => window.removeEventListener("scroll", handleScroll);
}, []);

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

The sticky header therefore doubles as a compact search dock once the hero clears the viewport.

## Desktop Navigation Structure
Navigation items render as `<a>` tags to preserve hash-based URLs but intercept clicks to drive the SPA router. Each entry includes an icon and text with an active underline marker.

```tsx
<nav className="flex items-center gap-6 text-sm text-white/80">
  {navItems.map(({ label, view, icon: Icon }) => {
    const itemHash = viewToHash(view.type === "substance" ? articleView : view);
    const active = isActive(view);

    return (
      <a
        key={label}
        href={itemHash}
        onClick={(event) => {
          event.preventDefault();
          handleNavigate(view);
        }}
        className={`relative flex items-center gap-2 font-medium transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
          active ? "text-white" : "text-white/70"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="relative inline-flex">
          {label}
          {active && (
            <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-fuchsia-400" />
          )}
        </span>
      </a>
    );
  })}
</nav>
```

- `isActive(view)` marks related routes (e.g., category detail still highlights “Substances”).
- Focus styles align with accessibility expectations thanks to `focus-visible` classes.
- The active indicator is absolutely positioned within the label span so the underline hugs the text regardless of icon width.

The “About” CTA sits to the right with its own halo when active:

```tsx
<a
  href={aboutHash}
  onClick={(event) => {
    event.preventDefault();
    handleNavigate(aboutView);
  }}
  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-white/90 ring-1 transition ${
    isAboutActive
      ? "bg-fuchsia-500/25 text-white ring-fuchsia-400/60 shadow-[0_8px_24px_rgba(232,121,249,0.25)] hover:bg-fuchsia-500/30"
      : "bg-white/10 ring-white/15 hover:bg-white/15"
  }`}
>
  <Info className="h-4 w-4" aria-hidden="true" />
  <span>About</span>
</a>
```

## Mobile Drawer Behavior
On screens below the md breakpoint, the inline nav hides (`md:flex` on the desktop container), and a menu toggle button appears. The button keeps a ref so click-outside logic can compare DOM targets.

```tsx
const [isMenuOpen, setIsMenuOpen] = useState(false);
const menuButtonRef = useRef<HTMLButtonElement | null>(null);
const menuPanelRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  setIsMenuOpen(false);
}, [currentView]);

useEffect(() => {
  if (!isMenuOpen) {
    return;
  }

  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as Node;
    if (
      menuPanelRef.current &&
      !menuPanelRef.current.contains(target) &&
      !menuButtonRef.current?.contains(target)
    ) {
      setIsMenuOpen(false);
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setIsMenuOpen(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  document.addEventListener("keydown", handleEscape);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleEscape);
  };
}, [isMenuOpen]);
```

The toggle button swaps between `Menu` and `X` icons and advertises its popup relationship via `aria-haspopup`, `aria-expanded`, and `aria-controls`.

```tsx
<button
  ref={menuButtonRef}
  type="button"
  onClick={() => setIsMenuOpen((prev) => !prev)}
  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
  aria-haspopup="true"
  aria-expanded={isMenuOpen}
  aria-controls="mobile-nav"
>
  {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
  <span className="sr-only">Toggle navigation</span>
</button>
```

When open, the panel is absolutely positioned relative to the button, floating beneath the sticky header without affecting page flow:

```tsx
{isMenuOpen && (
  <div
    ref={menuPanelRef}
    id="mobile-nav"
    className="absolute right-0 top-[calc(100%+0.75rem)] w-56 rounded-2xl border border-white/10 bg-[#120d27] p-4 shadow-xl shadow-black/50"
  >
    <nav className="flex flex-col gap-2 text-sm">
      {navItems.map(({ label, view, icon: Icon }) => (
        <a
          key={label}
          href={viewToHash(view.type === "substance" ? articleView : view)}
          onClick={(event) => {
            event.preventDefault();
            handleNavigate(view);
          }}
          className={`flex items-center justify-between rounded-xl px-3 py-2 transition ${
            isActive(view)
              ? "bg-white/15 text-white"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </span>
          {isActive(view) && <span className="h-2 w-2 rounded-full bg-fuchsia-400" />}
        </a>
      ))}
    </nav>
    <a ...>About</a>
  </div>
)}
```

Because the parent header is sticky, the mobile drawer scrolls with it; the panel’s shadow and border differentiate it from hero content that continues to pass underneath.

## Sticky Header & Search Transition Coordination
`App.tsx` further manages the vertical space reserved for the hero-aligned search when it ported back out of the header. This prevents layout thrash when the sticky header relinquishes the field.

```tsx
const [reservedTopSearchHeight, setReservedTopSearchHeight] = useState<number>(0);
const searchRootElementRef = useRef<HTMLDivElement | null>(null);

useLayoutEffect(() => {
  const element = searchRootElementRef.current;
  if (!element) {
    return;
  }

  if (searchTarget === topSearchContainer) {
    const rect = element.getBoundingClientRect();
    setReservedTopSearchHeight(rect.height);
  }
}, [searchTarget, topSearchContainer]);

<div
  ref={handleTopSearchContainerRef}
  className={topSearchWrapperClassName}
  style={reservedTopSearchHeight > 0 ? {
    height: reservedTopSearchHeight,
    minHeight: reservedTopSearchHeight,
    maxHeight: reservedTopSearchHeight,
  } : undefined}
/>
```

The effect ensures that while the header remains sticky, the hero retains the correct spacing so the global search can animate smoothly between contexts.

## Accessibility Considerations
- All interactive controls expose accessible names (`sr-only`, `aria-haspopup`, `aria-expanded`).
- `handleNavigate` always closes the mobile drawer to avoid stranding focus in an off-screen panel after route changes.
- Click-outside + escape listeners only attach while the panel is open, reducing unnecessary event work.

## Summary
The header mixes CSS-based stickiness (`sticky top-0`) with React-driven portal choreography to keep the search field accessible regardless of scroll depth. Desktop and mobile navigation share a single data source, while responsive toggles and off-canvas handling preserve keyboard and screen-reader usability. Backdrop styling and high z-index ensure the menu remains readable above dose.wiki’s luminous gradient background.
