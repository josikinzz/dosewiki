# SEO/Nav: Public Href Intent Module

## Files

- `src/utils/routing.ts`
- `src/types/navigation.ts`
- `src/features/article/components/sections/HeroSection.tsx`
- `src/features/article/components/sections/TripReportsSection.tsx`
- `src/features/article/components/sections/PharmacologySection.tsx`
- `src/features/article/components/sections/subjectiveEffectsShared.tsx`
- `src/features/reports/components/AuthorLink.tsx`
- `src/features/reports/components/ReportHeroSection.tsx`
- `src/components/pages/AboutPage.tsx`
- `src/components/pages/SearchResultsPage.tsx`
- `src/components/pages/CategoryPage.tsx`
- `src/components/pages/MechanismDetailPage.tsx`
- `src/components/pages/UserProfilePage.tsx`

## Problem

Public URL construction is split between `viewToPath`, route pages, sitemap/static-param helpers, and presentation Modules that manually interpolate href strings. Examples include contributor profile links lower-casing keys in report components, contributor links using `encodeURIComponent` in About, report links adding `?from=`, mechanism qualifier links, classification links, category links, effect links, and search-result href selection.

The existing public route planning and site metadata tasks cover route inventory, static params, sitemap, and canonical metadata. They do not give presentation Modules a deep Interface for "where should this public thing link?" As a result, callers still need to know slug encoding, legacy route choices, query-string conventions, profile-key normalization, and route-family prefixes. The current `AppView` Interface helps route chrome, but many content Modules bypass it because they need public content hrefs rather than current-view navigation state.

## Proposed deepening opportunity

Create a public href intent Module that owns URL generation for public content entities and recovery links. Its Interface should accept domain-shaped intents such as substance slug, effect slug, category key, mechanism qualifier, classification label or slug, report slug with optional source context, contributor profile key, and search query. The Implementation should hide encoding, lower-casing policy, query-string construction, and legacy-vs-canonical route choices.

Keep `viewToPath` as the AppView navigation Adapter if it remains useful for chrome state. The new Module should sit at a lower-level public URL Seam that route chrome, presentation Modules, metadata builders, and future route planning can all consume without importing UI state types. This avoids making every content Module an Adapter for URL policy.

## Benefits

- **Module**: Names public href generation as a Module instead of leaving it as string interpolation across route and content code.
- **Interface**: Gives callers an intent-oriented Interface so they do not need to know path prefixes, encoding rules, or optional query parameters.
- **Implementation**: Centralizes slug encoding, contributor-key handling, report back-context query strings, and canonical effect/category/mechanism paths.
- **Depth**: Increases Depth because a small set of href intent functions hides multiple route-family rules.
- **Seam**: Creates a public URL Seam separate from App Router files and separate from `AppView` state parsing.
- **Adapter**: `viewToPath`, sitemap/static-param generation, metadata URL builders, and presentation components can become Adapters over the same href policy where appropriate.
- **Leverage**: A future route rename or contributor-key policy change updates links across articles, reports, search, About, and contributor pages.
- **Locality**: Link bugs and SEO drift are investigated in one URL Module instead of hunting through page components and section renderers.

## Test plan

- Add unit tests for public href intents covering substances, effects, effect categories, dosage categories, mechanisms with and without qualifiers, chemical and psychoactive classifications, reports with and without source context, contributors, and search queries.
- Add fixtures for contributor keys with spaces, uppercase letters, and special characters to lock current encoding/lower-casing behavior before changing callers.
- Add regression tests comparing representative existing hard-coded href outputs to the new Module.
- Run `npm run typecheck` and the relevant component tests after migrating callers.

## Risk/rollout notes

Start by adding the Module and tests without changing rendered output. Migrate low-risk callers first, such as search results and static content links, then article/report sections where URL changes affect public SEO and shareability. Preserve legacy redirect targets such as `/effect/[effectSlug]` until a separate redirect policy decision changes them.
