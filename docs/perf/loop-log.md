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

## Iteration history

| # | Change | Primary Δ (shared gz) | `/` transfer Δ | Verify | Kept? |
| --- | --- | --- | --- | --- | --- |
| 0 | Baseline established | 168.1 KB | 838.4 KB / 58 req | build ✓ | — |
| 1 | Lazy-load icons (drop eager lucide bundle) | 168.1 KB (n/c) | 756.5 KB / 60 req (**−9.8%**) | app ✓ | ✅ |
