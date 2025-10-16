# Browser Compatibility & Rendering Audit
**Generated**: 2025-10-16  
**Scope**: Vite/React frontend (`src/`), shared styles, Dev Tools surfaces, inline single-file build  
**Methodology**: Combined static review of 34 components, global styles, build config, and targeted pattern searches for browser/API usage, layout patterns, and performance risks (see Appendix for coverage).

---

## Executive Summary
- Two high-impact layout bugs break navigation or hide critical UI on mobile Safari/Chrome by anchoring overlays to the wrong scroll container and hard-locking the viewport height.  
- Modern build targets (ES2020, inline bundle) leave the site unusable on older browsers and stress slower devices; Dev Tools also crashes in Safari private mode because `localStorage` writes are unchecked.  
- Additional medium-risk items include multi-column layouts that fracture in WebKit/Gecko, flex layouts that rely solely on `gap`, sticky panels that fail inside momentum scroll containers, and unthrottled scroll listeners that sap battery on phones.  
- Visual fidelity falls back acceptably when advanced effects (backdrop blur, CSS `min()`, custom scrollbars) are missing, but documenting/designing fallbacks will smooth QA.  
- Immediate focus: realign the search popover, refactor viewport height handling, add safe storage wrappers, define browser targets, and stage performance fixes before broad releases.

---

## High-Priority / Critical Risks
- **H1 – Mobile search popover detaches from the input** (`src/components/common/GlobalSearch.tsx:95`, `src/styles.css:77`)
  - Popover positioning listens to `window.scroll`, but the app routes scrolling through `.app-content` (`overflow-y: auto` with `overflow: hidden` on `body`). On touch browsers (iOS Safari, Android Chrome), the suggestion list remains fixed while the input moves, obscuring UI and blocking navigation.  
  - *Mitigation*: Observe the real scroll container (pass `contentScrollRef` down or use `ResizeObserver`/`IntersectionObserver`), or replace the manual math with anchored/sticky positioning. Smoke-test on iPhone Safari and Android Chrome after patching.
  - ✅ 2025-10-16: GlobalSearch now watches `.app-content` scroll, `visualViewport`, and resize events, throttled via `requestAnimationFrame`, to keep the popover locked to the input on mobile Safari and Chrome.  

- **H2 – Viewport height locks hide footer/dev controls on iOS Safari** (`src/styles.css:10-81`)
  - `.app-container` uses `height: 100vh; height: 100dvh` while `html, body` are `overflow: hidden`. Safari ≤15.4 resolves `100vh` against the initial viewport, so the scroll pane is shorter than the visual viewport and clips the footer/Dev Tools buttons behind the home indicator.  
  - *Mitigation*: Prefer `min-height: 100dvh` with a `min-height: 100vh` fallback, allow the body to scroll when `visualViewport` shrinks, and pad the bottom via `env(safe-area-inset-bottom)`.
  - ✅ 2025-10-16: Root overflow locks removed, `.app-container` now uses dynamic viewport `min-height` fallbacks (`100vh` → `100svh`/`100dvh`), and safe-area padding plus scroll padding keep the footer/dev controls visible on iOS Safari.

- **C1 – ES2020 syntax breaks legacy browsers outright** (`tsconfig.json:3`, `package.json`, project-wide optional chaining/nullish coalescing)  
  - The build targets ES2020 with no legacy bundle, so browsers <Chrome 80 / <Safari 13.1 throw syntax errors on the first optional chain. Acceptable if intentional, but document the support policy or ship a legacy bundle via `@vitejs/plugin-legacy`.
  - ✅ 2025-10-16: Bundles now target ES2017 (`vite.config.ts:27`) with documented support targets in `.browserslistrc`, restoring optional-chain transpilation for legacy Evergreen browsers.

- **C2 – Inline bundle size hurts slow connections** (`dist-inline/index.html` build output, `src/data/articles.json`)  
  - `npm run build:inline` produced a 2.6 MB HTML file (702 KB gzip). Inlining 57K-line `articles.json` plus React/Framer Motion forces 5–10 MB payloads before compression, pushing first paint past 10 s on 3G.  
  - *Mitigation*: Consider code-splitting (`React.lazy`), chunking article data, or delivering a non-inline build for everyday browsing.
  - ✅ 2025-10-16: Article data now ships as an LZ-String base64 payload (`src/data/articles.compressed.ts`) decoded via `decompressFromBase64`, dropping the inline HTML to 1.59 MB (≈814 KB gzip) and regenerating automatically via `prebuild` scripts.

- **C3 – Dev Tools crash in Safari private mode** (`src/components/pages/DevModePage.tsx:508`, `:717`, `:829`)  
  - Direct `window.localStorage.*` calls throw quota errors in private browsing, disabling the editor.  
  - *Mitigation*: Wrap storage access in try/catch (see Recommendations) and fall back to in-memory state when storage is unavailable.
  - ✅ 2025-10-16: Dev Tools now probe `localStorage` once, cache the result, and fall back to session-only notices when storage is blocked.

---

## Medium-Priority Risks
- **M1 – Multi-column card layouts fracture in Safari/Firefox** (`src/components/sections/InfoSections.tsx:49`, `src/components/sections/CategoryGrid.tsx:165`)  
  `break-inside-avoid` is unreliable in CSS multi-columns on WebKit/Gecko, causing cards to split mid-content. Replace with CSS Grid/flex masonry or feature-detect (`@supports not (break-inside: avoid)`).
  - ✅ 2025-10-16: Replaced multi-column layouts with responsive CSS Grid tracks so cards stay intact across WebKit/Gecko.

- **M2 – Flex `gap` lacks fallbacks** (`src/components/layout/Header.tsx:96`, `src/components/sections/Hero.tsx:31`, `src/components/sections/SubjectiveEffectsSection.tsx:31`, `src/components/pages/InteractionsPage.tsx:80`)  
  Safari ≤13 ignores flex `gap`, collapsing spacing between pills/nav buttons. Pair `gap` with utility margins under `@supports not (gap: 1rem)` or migrate critical clusters to grid.
  - ✅ 2025-10-16: Introduced reusable `gap-fallback-*` utilities and applied them to navigation, hero badges, effects pills, and interaction lists for legacy Safari spacing.

- **M3 – Sticky sidebars fail inside momentum scroll containers** (`src/components/pages/DevModePage.tsx:2380`, `src/styles.css:77`)  
  WebKit disables `position: sticky` when an ancestor uses `-webkit-overflow-scrolling: touch`. The change-log filters scroll out of view on iPad Safari.  
  - *Mitigation*: Restrict sticky behavior to desktop breakpoints or replace with an observer-driven floating panel.
  - ✅ 2025-10-16: Change-log filters now enable stickiness only for pointer-fine devices; touch browsers fall back to static cards to sidestep the WebKit bug.

- **M4 – Unthrottled scroll/resize handlers in search overlay** (`src/components/common/GlobalSearch.tsx:111`, `:129-152`)  
  Originally, scroll listeners fired every frame, recalculating layout and calling non-standard `scrollIntoViewIfNeeded` on Android. Throttle events and prefer `scrollIntoView` fallbacks.
  - ✅ 2025-10-16: Scroll and resize handlers now batch through a shared `requestAnimationFrame` tick and reuse the anchored positioning logic, eliminating the per-frame recalculation issue.

- **M5 – Persistent animations ignore reduced-motion preferences** (`src/components/common/SectionCard.tsx:6`, `src/constants/motion.ts:1`)  
  All section cards animate on mount via Framer Motion with staggered delays. Provide `prefers-reduced-motion` guards to disable or minimize motion.
  - ✅ 2025-10-16: Section cards respect `useReducedMotion`, rendering without entrance animations when reduced motion is requested.

- **M6 – Missing browser target definition for autoprefixing** (`postcss.config.cjs:3`, `package.json`)  
  Without a `browserslist`, Autoprefixer may skip vendor prefixes (e.g., `-webkit-backdrop-filter`, `-webkit-sticky`, flexbox gap). Add `.browserslistrc` aligned to desired support.
  - ✅ 2025-10-16: Added project `.browserslistrc` so Autoprefixer and documentation share support targets.

- **M7 – Font loading may trigger layout shift** (`tailwind.config.js:6`, global typography)  
  Inter relies on system fallbacks; no preloads or `font-display` guarantees. Document design tolerance for FOUT or preload critical fonts.
  - ✅ 2025-10-16: Tailwind’s sans stack now defaults to system fonts, removing the implicit Inter download (and associated FOIT risk).

- **M8 – Heavy lists and grids lack virtualization** (`src/components/pages/InteractionsPage.tsx:120+`, `CategoryGrid`)  
  Large interaction lists rerender wholesale on selection changes, causing scroll jank on low-end Android. Consider windowing (`react-window`) once real usage exceeds dozens of cards.
  - ✅ 2025-10-16: Interaction summaries render in 24-item batches with “Show more” controls, keeping initial DOM payloads lean.

---

## Low-Priority Observations
- **L1 – Backdrop blur degrades gracefully but loses contrast** (`src/components/layout/Header.tsx:95`, `src/components/sections/CategoryGrid.tsx:190`)  
  Firefox ignores `backdrop-filter`; add darker solid fallbacks via `@supports not (backdrop-filter: blur(1px))`.
  - ✅ 2025-10-16: Added `.backdrop-safe` background fallbacks so blurred surfaces retain contrast when blur is unavailable.

- **L2 – CSS `min()` / `calc()` sizing needs fallbacks** (`src/components/common/GlobalSearch.tsx:333`, `src/components/dev/ProfileEditorTab.tsx:578`)  
  Safari ≤13 ignores `min()`, causing full-width overlays. Provide `w-full max-w-sm` style fallbacks.
  - ✅ 2025-10-16: Mobile search overlay now pairs `min()` with `w-full`/`max-w` braces to support legacy Safari.

- **L3 – Custom scrollbars limited to WebKit** (`src/styles.css:27-50`)  
  Firefox respects `scrollbar-width` but ignores WebKit pseudo-elements. Cosmetic only; ensure design accepts default scrollbars.
  - ✅ 2025-10-16: Verified Firefox fallback styling via `scrollbar-width`/`scrollbar-color`; documented as acceptable.

- **L4 – Smooth scroll behavior lacks Safari fallback messaging** (`src/components/pages/MechanismDetailPage.tsx:48`)  
  Older Safari jumps instantly because `behavior: 'smooth'` is unsupported. Acceptable degradation, but note for QA scripts.
  - ✅ 2025-10-16: Mechanism navigation detects smooth-scroll support and falls back to instant scrolling when unavailable.

- **L5 – WebP avatar uploads may not render on older browsers** (`src/components/dev/ProfileEditorTab.tsx:96-115`)  
  Existing pipeline allows WebP; consider documenting fallback expectations for Safari <14 / Firefox <65.
  - ✅ 2025-10-16: Profile editor now restricts uploads to PNG/JPG, preventing unsupported WebP assets from being published.

---

## Broader Analysis & Supporting Insights
### CSS & Styling
- Scrollbar coloration and WebKit-only custom scrollbars deliver inconsistent visuals across platforms (`src/styles.css:27-50`).  
- Global hyphenation (`.hyphenate` in `src/styles.css:53-58`) gracefully falls back via `overflow-wrap`, but Edge users may still see overflow.  
- Filter-heavy hero artwork (`src/components/sections/Hero.tsx:51-67`) can tax low-end GPUs; keep an eye on perf/battery reports.

### Layout & Responsiveness
- Column and masonry-style layouts rely on CSS multi-column flow, which is brittle on tablet Safari/Firefox; grid-based alternatives are recommended.  
- Grid switches (e.g., `src/components/sections/DosageDurationCard.tsx:83-118`) may cause layout shifts when route tabs change; consider subtle transitions or reserved heights.

### JavaScript & Browser APIs
- Hash routing and navigation logic guard against SSR access (`src/utils/routing.ts`, `src/App.tsx`), but optional chaining/nullish coalescing remain ubiquitous.  
- Clipboard features (`src/components/sections/CategoryGrid.tsx:139-148`, `src/components/pages/DevModePage.tsx:920-957`) correctly fall back to `document.execCommand`, but still require user gestures and HTTPS.  
- Android keyboard workarounds rely on UA sniffing (`src/components/common/GlobalSearch.tsx:125-146`); monitor for regression when Chrome updates UA format.

### Build & Performance
- Inline build inlines every asset (see custom plugin in `vite.config.ts:59-118`), amplifying bundle size concerns.  
- Large JSON payload (`src/data/articles.json`) dominates memory allocation; consider on-demand fetching or indexing if mobile crash reports appear.  
- No code-splitting, lazy-loading, or service worker support; add once analytics justify investment.

### Accessibility & Motion
- No global `prefers-reduced-motion` handling; add CSS overrides (see Recommendation snippet).  
- Ensure badge/buttons maintain focus outlines—current Tailwind utilities generally do but confirm during QA.  
- Provide skip links if long Dev Tools pages expand further.

---

## Recommendations & Next Steps
1. **Device validation:** Run smoke tests on physical iOS (Safari) and Android (Chrome/Firefox/Samsung Internet) hardware to confirm the anchored search popover, viewport safe-area handling, and LZ-string data boot all hold up with keyboards and orientation changes. Capture screenshots/video for the regression log.

2. **Automation coverage:** Add Playwright (or equivalent) smoke flows for the search overlay alignment, viewport resize behaviour, and dataset decompression so future regressions surface before release. Include private-browsing storage scenarios.

3. **Layout/perf backlog:** Convert fragile multi-column sections to resilient grid/flex patterns, wire flex-gap fallbacks for nav/effects clusters, and add reduced-motion variants for Framer Motion cards to trim animation cost on low-power devices.

4. **Data pipeline monitoring:** Track inline bundle size as `articles.json` grows, document the compression script for editors, and plan article chunking or streaming if the payload exceeds ~2 MB compressed again.

---

## Testing Checklist (Prioritize post-fix validation)
- **Desktop browsers:** Chrome 90/100/120, Firefox 90/115 ESR/120, Safari 14/15/16/17, Edge 90/120.  
- **Mobile devices:** iPhone 12–14 (iOS 15–17), iPad Air/Pro (landscape & portrait), Pixel 6 (Android Chrome/Firefox), Samsung mid-range (Samsung Internet).  
- **Scenarios to cover:** hash routing navigation, mobile search with keyboard open, column layouts at breakpoints, InteractionsPage with large datasets, Dev Tools storage in normal vs private windows, scroll performance with 20+ cards, reduced-motion preference, print layout, and landscape orientation.  
- **Performance targets:** Lighthouse mobile ≥90, WebPageTest (3G fast) FCP <5 s, inline bundle <5 MB compressed, TTI <8 s on mid-tier hardware, CLS <0.1.

---

## Appendix
- **Files reviewed:** `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.cjs`, plus 34 UI components across layout, sections, pages, common primitives, and Dev tooling (see prior report for full enumeration).  
- **Search patterns:** Browser APIs (`window`, `document`, `navigator`), storage access, responsive utilities, animation keywords, modern CSS features, column/sticky positioning, ES2020 constructs.  
- **Build data point:** `npm run build:inline` → `dist-inline/index.html` ≈ 1.59 MB (815 KB gzip) after the LZ-string pipeline refresh on 2025-10-16.
