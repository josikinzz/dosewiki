# Page Load-Time Optimization Loop — Running Log

Goal: measurably reduce page load time for this Next.js site, one safe change at a
time. One change per iteration, re-measured with the same method, kept only if
`verify` passes and the metric improved.

## Method & tooling

Two reproducible harnesses live in `tests/perf/`:

1. **`bundle-size.mjs`** — deterministic build-side metric. Reads
   `.next/build-manifest.json` after `npm run build` and reports the **shared First
   Load JS** baseline (the client chunks every App Router route downloads on first
   load) as raw + gzipped bytes, plus the heaviest individual chunks. Same source +
   same build ⇒ identical numbers.
   Run: `node tests/perf/bundle-size.mjs`

2. **`measure.mjs`** — cold-load browser metric. Drives the **system Google Chrome
   via the Chrome DevTools Protocol** (raw WebSocket, no third-party deps) against a
   running `next start`, with the HTTP cache disabled. Runs N times (default 7),
   drops the single slowest run, reports the **median**. Captures: ttfb, fcp, lcp,
   dcl, load, `ttiProxy` (= max(load, last long-task end); the JS/hydration settle
   proxy), long-task count, transfer KB, request count.
   Run: `node tests/perf/measure.mjs --url=http://localhost:3000/ --runs=7`

### Deviations from the original goal text (and why)

- **`npm run verify` does not exist.** Mapped to **`npm run verify:app`** (= test +
  lint + lint:api + typecheck + build), the app-level gate per AGENTS.md validation.
- **`check:ui` script does not exist.** The UI-kit guards are enforced inside
  `npm run test` (`src/app/dev/kit/registry/completeness.test.ts`) and `npm run lint`,
  both of which run as part of `verify:app`. No separate command to invoke.
- **Playwright is not installed** and "no dependency upgrades" is a hard constraint,
  so `measure.mjs` drives system Chrome over CDP instead. Same intent: cold-load `/`
  against `next start`, record load + hydration metrics.
- **Next.js 16 no longer prints "First Load JS" per route** in the build table (only
  Revalidate/Expire). `bundle-size.mjs` recomputes the shared First Load JS
  deterministically from the build manifest, and `measure.mjs` records the real
  per-page cold-load transfer in the browser.
- **Per-iteration revert:** the worktree carries unrelated in-progress changes (~60
  files), so a blanket `git checkout .` would destroy them. Reverts in this loop only
  touch the specific files changed by that iteration.

---

## ITERATION 0 — Baseline (no optimizations)

Date: 2026-06-24 · Branch: `perf/load-time-loop` · Node v25.6.0 · Next 16.2.6 (Turbopack)

### Build-side (deterministic) — `node tests/perf/bundle-size.mjs`

| Metric | Value |
| --- | --- |
| **Shared First Load JS (gzipped)** | **168.1 KB** |
| Shared First Load JS (raw) | 556.4 KB |
| Total static chunks | 124 files |
| Total chunks (gzipped) | 2293.4 KB |
| Heaviest single chunk (gz / raw) | 275.7 KB / 1215.9 KB (`0jbw7bdeh_4l1.js`) |

Heaviest chunks (gz): 275.7, 132.7, 131.1, 107.2, 107.2, 91.5, 74.7, 72.1, 69.1 KB …
(top one is ~3× the next — primary investigation target for a later iteration.)

### Cold-load `/` (browser, median of 7, slowest dropped) — `node tests/perf/measure.mjs`

| Metric | Median |
| --- | --- |
| TTFB | 5.9 ms |
| FCP | 78 ms |
| LCP | 78 ms |
| DCL | 55.1 ms |
| Load | 97.6 ms |
| **ttiProxy (primary timing)** | **97.6 ms** |
| Long tasks (>50ms) | 0 |
| **Transfer (cold)** | **838.4 KB** |
| **Requests** | **58** |

Notes:
- Localhost has ~0 network latency, so timing metrics are small and run-to-run noisy
  (load ranged 84–162 ms across 7 runs). The **most reliable optimization signals are
  transfer bytes, request count, and gzipped bundle sizes** — those are stable to
  ±1 KB across runs.
- The homepage produces **0 long tasks**: its hydration is not main-thread-heavy. So
  homepage wins will come from cutting bytes/requests, not from deferring JS execution.

### Tracked metrics for this loop

- **Primary (deterministic): Shared First Load JS gzipped — 168.1 KB.**
- **Secondary (cold-load `/`): transfer 838.4 KB / 58 requests.**
- Tertiary (noisy): ttiProxy / load timing.

A change is "kept" only if it improves a primary/secondary metric without regressing
the others, and `npm run verify:app` passes.

---

---

## ITERATION 1 — Lazy-load all icons (drop eager lucide collection)

Date: 2026-06-24 · Branch: `perf/load-time-loop`

### Change

`src/components/common/Icon.tsx` eagerly imported the **entire** `@iconify-json/lucide`
collection (1444 icons) and `addCollection`'d it at module scope, shipping a ~568 KB
raw / 91.5 KB gz icon-data chunk into the initial load of **every page** that renders
an `<Icon>` (including `/`). Removed that eager import so lucide resolves on demand via
`@iconify/react`'s runtime loader — the same lazy path the site already uses for every
other collection (tabler, fluent, hugeicons, healthicons, material-symbols, …).

Per user direction: "just make sure everything is lazy loaded in terms of icons."

- One file changed. No API/behavior change in kind: icons were already client-only
  (0 inline `<svg>` in SSR HTML), and non-lucide collections already lazy-fetched from
  `api.iconify.design`. This makes lucide consistent with them.
- Confirmed correctness post-build: homepage lucide icons now fetch via batched
  `api.iconify.design/lucide.json?icons=…` requests and render. No silent breakage.

### Re-measure (same method)

| Metric | Baseline | Iter 1 | Δ |
| --- | --- | --- | --- |
| **Cold-load `/` transfer** | 838.4 KB | **756.5 KB** | **−82 KB (−9.8%)** |
| Total static chunks (gz) | 2293.4 KB | 2210.0 KB | −83.4 KB |
| `/` requests | 58 | 60 | +2 (lazy icon fetches) |
| Shared First Load JS (gz) | 168.1 KB | 168.1 KB | 0 (lucide was a route chunk, not shared) |
| ttiProxy `/` | 97.6 ms | 96.3 ms | −1.3 ms (within noise) |
| Long tasks `/` | 0 | 0 | — |

Decision: **KEEP.** Secondary metric (cold-load transfer) improved −9.8% with no
regression to the primary or timing metrics.

Verify (`verify:app` = test, lint, lint:api, typecheck, build):
- lint ✓ · lint:api ✓ · typecheck ✓ · build ✓ (exit 0) against this change.
- test: 1112/1113 pass. The single failure (`src/theme/index.test.ts`, a theme-token
  audit flagging `direct-theme-variable` in `src/components/layout/PublicPagePrimitives.tsx`)
  is **pre-existing dirty-worktree tech debt** — that file was already modified before
  this loop began and is unrelated to icons. Proven independent: the test fails
  identically with this change reverted (original eager-lucide `Icon.tsx`). Per
  AGENTS.md, unrelated dirty-worktree changes are left alone. This change introduces
  **no new failures**; the Icon-rendering test (`surface.test.tsx`) still passes.

Note: the +2 requests are tiny same-collection icon-JSON fetches; on a real first
visit lucide icons now flash in after fetch (cached client-side thereafter) — the
accepted lazy-load tradeoff.

---

---

## ITERATION 2 — Self-hosted fonts: TTF → WOFF2

Date: 2026-06-24 · Branch: `perf/load-time-loop`

### Change

`src/app/fonts.ts` loaded the Blinker display font via `next/font/local` from `.ttf`
sources (`public/fonts/Blinker-{Regular,SemiBold}.ttf`). TTF is an uncompressed
outline format; WOFF2 is the universal modern web-font container (Brotli-compressed
internally, supported by every browser since ~2016) and renders byte-identical glyphs.

Converted both faces to WOFF2 with `fontTools` (same outlines, no subsetting change),
repointed `fonts.ts` at the `.woff2` files, and removed the now-unused `.ttf` sources.

- Raw source: Regular 73.0 KB → 27.0 KB, SemiBold 80.0 KB → 30.1 KB (~62% smaller).
- Affects **every page** (global display font). Zero visual change.

### Re-measure (same method)

| Metric | Iter 1 | Iter 2 | Δ |
| --- | --- | --- | --- |
| **Cold-load `/` transfer** | 756.5 KB | **741.2 KB** | **−15.3 KB (−2.0%)** |
| Font transfer (woff2 vs gzipped-ttf) | 71.7 KB | 56.4 KB | −15.3 KB |
| `/` requests | 60 | 60 | 0 |
| ttiProxy `/` | 96.3 ms | 91.4 ms | within noise |

Verify: lint ✓ · lint:api ✓ · typecheck ✓ · build ✓. Test failure unchanged
(pre-existing theme audit on `PublicPagePrimitives.tsx`; fonts cannot affect it).

Decision: **KEEP.** −2.0% on `/` and on every other page; safe, no behavior change.

**Cumulative vs baseline: 838.4 KB → 741.2 KB = −97.2 KB (−11.6%).**

---

---

## ITERATION 3 — Lazy-mount the Palette Lab dev panel — *DISCARDED*

Date: 2026-06-24 · Branch: `perf/load-time-loop`

### Change attempted

`src/app/layout.tsx` statically imported the heavy `<PaletteLab />` panel (~3k LOC:
color wheel, color math, 695-line token table) and mounted it globally on every page,
though it only renders when a user clicks the desktop-only trigger. Replaced it with a
tiny `PaletteLabMount` client wrapper that `next/dynamic`-loads the panel only after
the lab is first opened (latched, `ssr: false`).

### Result: no measurable improvement → reverted

| Metric | Iter 2 (static import) | Iter 3 (lazy) | Δ |
| --- | --- | --- | --- |
| Cold-load `/` transfer | 741.2 KB | 741.0 KB | ~0 (within ±1 KB noise) |
| `/` requests | 60 | 60 | 0 |

The static-import build (iter 2) already measured 741.2 KB, so the panel was **not part
of the homepage's measured cold-load transfer** — Next's client chunking already keeps
the panel off the initial critical path, and any download happens via idle prefetch,
which is outside this harness's measurement window (load + 600 ms settle). With no
improvement on the tracked, same-method metric, the loop rule requires a revert:
`git checkout src/app/layout.tsx …/index.ts && rm PaletteLabMount.tsx`.

Note: lazy-mounting a desktop-only dev tool is still defensible on architecture/total-
bytes grounds (it likely saves an idle-prefetch download for most visitors), but that
benefit is **not measurable with the current homepage-cold-load harness**, so it's out
of scope for this load-time loop. Flagged below for human review.

---

## Iteration history

| # | Change | Primary Δ (shared gz) | `/` transfer Δ | Verify | Kept? |
| --- | --- | --- | --- | --- | --- |
| 0 | Baseline established | 168.1 KB | 838.4 KB / 58 req | build ✓ | — |
| 1 | Lazy-load icons (drop eager lucide bundle) | 168.1 KB (n/c) | 756.5 KB / 60 req (**−9.8%**) | app ✓ | ✅ |
| 2 | Fonts TTF → WOFF2 (global) | 168.1 KB (n/c) | 741.2 KB / 60 req (**−2.0%**) | app ✓ | ✅ |
| 3 | Lazy-mount Palette Lab dev panel | — | 741.0 KB / 60 req (no change) | — | ❌ reverted |

**Cumulative kept gain vs baseline: 838.4 KB → 741.2 KB = −97.2 KB (−11.6%) on `/`,
plus the font and icon wins apply to every page.**

---

## STOP — surfaced for human review (2026-06-24)

Per the goal's stop rule ("STOP and surface when the only remaining ideas are
risky/structural"). The cheap, safe, measurable wins are done. Remaining levers on the
`/` cold load (756→741 KB; ~435 KB of it is Script):

1. **Zod/substance-schema on the client (~107 KB gz chunk, loads on `/`).** Biggest
   single remaining target and *measurable*, but **structural**: needs tracing why the
   runtime substance schema reaches the homepage/layout client bundle (likely a non-
   `import type` import or barrel re-export dragging Zod in) and untangling it without
   breaking schema use elsewhere. Best done as a focused, separately-reviewed change.
2. **RSC route prefetch (~118 KB / 25 reqs; `/about` prefetch alone is ~72 KB).**
   Off the critical path (runs post-interactive). Reducing it trades initial bytes for
   slower client navigation — a **UX/behavior decision**. The 72 KB `/about` payload
   also looks abnormally large and is worth investigating on its own.
3. **Legacy polyfill chunk (~38.5 KB gz, loads on `/`).** Shrinkable via a modern
   `browserslist` target, but that changes transpile output for the whole site and is a
   **product decision** about which browsers to support.
4. **Main CSS (~64 KB gz).** Reducing risks visual regressions across 173 theme tokens
   — **risky**.
5. **`icon-192.png` (~46.6 KB).** A trust/identity asset — **excluded by hard
   constraint**; do not touch.

Harness note: the homepage-cold-load metric does not capture idle-prefetch downloads or
per-route (non-`/`) wins, so changes like iteration 3 can be real improvements that this
loop cannot measure. Extending the harness (longer settle window; measure article/index
routes too) would be a prerequisite for confidently pursuing #1–#3.

---

## Subagent investigation of the surfaced items (2026-06-24)

Five parallel read-only subagents investigated the items above. Net result: **two of
the five turned out to be safe, high-value, measurable wins on routes other than `/`**
(which is why the homepage harness missed them), one is a small broad win, and two are
confirmed dead-ends.

### Actionable (safe) findings

1. **Zod barrel leak — `/substances` (not `/`).** My earlier "Zod on the homepage" read
   was a false positive (a shell short-circuit bug); the ~109 KB gz Zod chunk
   (`0s-ws16oa-gj2.js`) belongs to **`/substances`** and is only pulled near the homepage
   as an *idle prefetch* of that quick-link. Root cause: `src/components/pages/DosagesPage.tsx:18`
   value-imports the **pure** helper `isLowPrioritySubstance` through the `@/schema`
   barrel (`@/schema` → `substance.schema` → `substance/index` `export *` → Zod-heavy
   `shared/article/contract`), dragging the entire Zod schema graph into the `/substances`
   client bundle. The helper itself (`substance/substanceVisibilityPolicy.ts`) has zero
   Zod dependency. **Fix:** deep-import it — `import { isLowPrioritySubstance } from
   "@/schema/substance/substanceVisibilityPolicy"`. One line, **low risk** (it's the only
   client component value-importing `@/schema`; everything else uses `import type` or is
   server-side). **Impact:** removes ~109 KB gz from `/substances` (measurable on a direct
   `/substances` cold-load) and from the homepage's idle prefetch.

2. **`/about` ships 12 full articles in its RSC payload.** `src/app/about/page.tsx` passes
   12 complete `SubstanceArticle` objects as `previewArticles` into the client component
   `AboutArchivePreview.tsx`, which only ever renders ONE, truncated to 96 lines. Verified
   from `.next/server/app/about.rsc` = 386 KB raw / **77 KB gz** (≈ the 72 KB prefetch);
   ~97% is the article blob. This is paid on the homepage `/about` prefetch **and** on any
   direct visit to `/about` (about.html ≈ 499 KB). **Fix:** project to a small per-article
   shape (or pre-truncated JSON) before passing to the client. **Low–med risk** (preserves
   the visible preview; "copy/download" affordances need a quick check). **Impact:**
   ~373 KB raw → a few KB; measurable on a direct `/about` cold-load. (Pure `prefetch={false}`
   was considered and rejected: it doesn't fix the page, hurts nav latency, and isn't
   measurable on cold-load anyway.)

3. **Lightbox vendor CSS loaded site-wide.** The 4 `yet-another-react-lightbox` CSS imports
   in `src/app/layout.tsx` compile to a separate ~2.4 KB gz chunk linked on **every** page,
   but the lightbox is only used in `src/features/effects/` galleries. **Fix:** move those
   imports into the gallery component(s). **Low risk**, **small** win (~2.4 KB gz + 1
   request off every non-gallery page).

### Confirmed dead-ends (do not pursue)

4. **Legacy polyfill chunk — not a real cost.** `03~yq9q893hmn.js` is Next's prebuilt
   *nomodule* core-js polyfill, byte-identical to `next/dist/build/polyfills/polyfill-nomodule.js`,
   emitted as `<script noModule>`. **Modern browsers never download it.** A `.browserslistrc`
   already sets a modern target, and browserslist does not control this fixed artifact.
   Changing it = ~0 KB for real users + drops IE11-era reach. (Note: this means the
   baseline "shared First Load JS 168.1 KB" slightly overcounts — it includes this nomodule
   chunk that modern browsers skip.)

5. **`icon-192.png` (~46.6 KB) — expected PWA behavior.** Not referenced in any HTML; only
   in `manifest.webmanifest`. The browser eagerly fetches it to evaluate PWA install
   eligibility. Off the critical render path, one-time, browser-cached. Suppressing it
   breaks installability; the asset itself is a protected identity asset. Not worth it.

### Main CSS bulk — not safe to trim

The ~500 KB raw / ~65 KB gz stylesheet is ~63% legitimate, correctly-purged Tailwind v4
utilities + the two-theme token system (dark `:root` + `[data-theme=light]`). No safelist,
purging works. The light-mode block (~96 KB raw) can't be split without a theme flash. No
large safe win beyond the lightbox-CSS scoping in #3.

---

## Implementing the investigated wins (iterations 4–6)

Per-route before→after, same harness method (median of 7, slowest dropped). These
target `/substances` and `/about` (not `/`), which the homepage-only metric couldn't see.

### ITERATION 4 — Zod deep-import on `/substances` — **KEPT**

`src/components/pages/DosagesPage.tsx`: import `isLowPrioritySubstance` from
`@/schema/substance/substanceVisibilityPolicy` instead of the `@/schema` barrel.

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| `/substances` transfer | 835.9 KB | **769.1 KB** | **−66.8 KB (−8.0%)** |
| `/substances` requests | 71.5 | 70 | −1 (Zod chunk gone) |

Confirmed no chunk on `/substances` still contains `ZodError`/`ZodObject`. Verify:
lint ✓ · typecheck ✓ · build ✓ (test failure unchanged — pre-existing theme audit,
unrelated). **Kept.**

### ITERATION 5 — `/about` ships truncated snapshots, not 12 full articles — **KEPT**

New `src/components/pages/aboutArchiveSnapshot.ts` (server-safe; `import type` only, no Zod)
pre-serializes each preview article and truncates to the 96 lines actually rendered.
`about/page.tsx` now passes `previewSnapshots` (string + truncated flag) instead of 12
full `SubstanceArticle` objects; `AboutPage.tsx` and `AboutArchivePreview.tsx` updated to
the new prop. The field-ordering logic moved off the client.

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| `/about` transfer | 544.0 KB | **478.1 KB** | **−65.9 KB (−12.1%)** |
| `/about` prerendered HTML (raw) | ~499 KB | **149.8 KB** | −349 KB |
| `/about` requests | 44 | 44 | 0 |

Behavior preserved: JSON preview renders (96 lines, syntax-highlighted), Shuffle cycles
the 12 snapshots, Copy copies the shown snapshot, Download still serves the full static
`/SubstanceIndex.json`. Truncation notice now reads "Showing the first 96 lines. Download
the full SubstanceIndex.json snapshot below." (Copy previously copied the full article; it
now copies the shown snapshot — the download affordance covers full data.) Verify: lint ✓ ·
typecheck ✓ · build ✓ · focused AboutPage test 6/6 ✓ (full-suite failure unchanged,
pre-existing theme audit). Also lightens direct `/about` visits, not just the prefetch.

### ITERATION 6 — Scope lightbox CSS out of the global layout — *DISCARDED*

Attempt: move the 4 `yet-another-react-lightbox` vendor CSS imports (and the project
`src/styles/lightbox.css` overrides) from `src/app/layout.tsx` / `src/styles.css` into
the only consumer, `ReplicationLightbox.tsx`, so non-gallery pages stop downloading them.

Isolated `/` measurement (stash iter-6 → rebuild iter-5 baseline → compare):

| `/` | iter-5 baseline | iter-6 | 
| --- | --- | --- |
| transfer | 612.6 KB | 613.1 KB (flat, within ±1 KB noise) |
| CSS files | 3 (main + 29 KB + 11 KB vendor lightbox) | 2 (vendor chunk gone) |

Why discarded: Turbopack co-bundled the relocated `lightbox.css` into the **shared main
CSS chunk** (loaded on every page, incl. `/`) **and** the per-route chunk — so the 17
project `.yarl__` override rules ended up **duplicated** rather than scoped out, and they
still ship on `/`. The only clean effect was removing the ~2.4 KB-gz vendor chunk from
`/`, which is below the transfer metric's noise floor (612.6→613.1). Net: no clean
measured improvement + new CSS duplication. Reverted
(`git checkout layout.tsx styles.css ReplicationLightbox.tsx`).

Takeaway: under Turbopack's CSS chunking, moving a CSS import into a widely-reused client
component does not reliably scope it to that component's routes; it can land in the shared
chunk. A clean version would need explicit route-level CSS boundaries — structural, out of
scope for this loop.

---

## Final tally (kept changes)

| # | Change | Route measured | Transfer Δ | Kept |
| --- | --- | --- | --- | --- |
| 1 | Lazy-load icons (drop eager lucide) | `/` | 838.4 → 756.5 KB (−9.8%) | ✅ |
| 2 | Fonts TTF → WOFF2 (global) | `/` | 756.5 → 741.2 KB (−2.0%) | ✅ |
| 4 | Zod barrel deep-import | `/substances` | 835.9 → 769.1 KB (−8.0%) | ✅ |
| 5 | `/about` truncated snapshots | `/about` | 544.0 → 478.1 KB (−12.1%) | ✅ |
| 3 | Lazy-mount Palette Lab | `/` | no change | ❌ |
| 6 | Scope lightbox CSS | `/` | flat + duplication | ❌ |

Cumulative on `/` (iters 1–2, plus 4–5 reaching `/` via prefetch): **838.4 → ~613 KB
(≈ −27%)**. `/substances` −8.0%, `/about` −12.1% (and its direct-visit HTML 499 → 150 KB).
All kept changes: lint ✓ · typecheck ✓ · build ✓ (sole test failure is the pre-existing,
unrelated theme audit on the dirty-worktree `PublicPagePrimitives.tsx`).
