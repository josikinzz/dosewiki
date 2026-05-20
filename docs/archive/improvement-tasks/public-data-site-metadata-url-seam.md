# Public Data Site Metadata URL Seam

## Files

- `lib/next/metadata.ts`
- `lib/next/sitemap.ts`
- `src/app/layout.tsx`
- `src/app/sitemap.ts`
- Public route pages with `generateMetadata`, including:
  - `src/app/[slug]/page.tsx`
  - `src/app/effects/[effectSlug]/page.tsx`
  - `src/app/reports/[slug]/page.tsx`
  - `src/app/category/[categoryKey]/page.tsx`
  - `src/app/chemical/[slug]/page.tsx`
  - `src/app/psychoactive/[slug]/page.tsx`
  - `src/app/mechanism/[mechanismSlug]/page.tsx`
  - `src/app/mechanism/[mechanismSlug]/[qualifierSlug]/page.tsx`
  - `src/app/contributors/[profileKey]/page.tsx`

## Problem

Site URL and metadata conventions are duplicated across metadata and sitemap modules. `lib/next/metadata.ts` and `lib/next/sitemap.ts` both hard-code `https://dose.wiki`, while route pages manually assemble pathnames and page-specific fallback titles/descriptions.

The current metadata helper is useful but shallow: callers still need to know canonical pathname rules, fallback metadata policy, site URL assumptions, and dynamic route path construction. This creates drift risk between canonical URLs, Open Graph URLs, sitemap URLs, and route planning.

## Proposed deepening opportunity

Introduce a public site identity and route metadata module. Its interface should expose canonical URL construction, site asset URLs, page metadata building, and sitemap URL building from the same source.

Where possible, route metadata should consume the public route planning module rather than manually interpolating pathnames. This creates one seam for site URL changes and one implementation for canonical, Open Graph, Twitter, and sitemap URL behavior.

## Benefits using skill vocabulary

- **Depth**: callers provide page intent and route identity while URL/canonical/Open Graph/sitemap mechanics stay behind the interface.
- **Leverage**: a single site URL or metadata policy change updates metadata and sitemap together.
- **Locality**: canonical path construction and absolute URL behavior stop being spread across route pages.
- **Seam**: tests can verify metadata and sitemap URL behavior without needing App Router pages.
- **Adapter**: Next metadata objects and sitemap entries become adapters over the same site identity module.

## Test plan

- Add tests for canonical URL construction, absolute URL construction, Open Graph image URLs, and no-index robots behavior.
- Add tests that sitemap URL generation and page metadata use the same base site URL.
- Add route metadata fixture tests for representative public route families.
- Run `npm run typecheck` and relevant unit tests.

## Risk/rollout notes

- SEO regressions can be subtle. Snapshot current metadata for a few representative routes before switching.
- Preserve existing canonical path behavior unless a separate SEO decision changes it.
- If preview deployments need non-production canonical behavior later, add that as an explicit adapter rather than reading arbitrary request headers in public static metadata.
