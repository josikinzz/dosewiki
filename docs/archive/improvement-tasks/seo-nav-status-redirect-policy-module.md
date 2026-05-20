# SEO/Nav: Status and Redirect Policy Module

## Files

- `src/app/page.tsx`
- `src/app/data/page.tsx`
- `src/app/interactions/page.tsx`
- `src/app/effect/[effectSlug]/page.tsx`
- `src/app/not-found.tsx`
- `src/app/error.tsx`
- `src/app/loading.tsx`
- `src/app/[slug]/loading.tsx`
- `src/app/category/[categoryKey]/loading.tsx`
- `src/app/effects/[effectSlug]/loading.tsx`
- `src/app/reports/[slug]/loading.tsx`
- `src/app/search/[query]/loading.tsx`
- `src/app/robots.ts`
- `src/app/sign-in/page.tsx`
- `src/app/unauthorized/page.tsx`
- `src/app/dev/[[...segments]]/page.tsx`

## Problem

Redirect, status, loading, and crawler-exclusion behavior is spread across small App Router files. Root, data, interactions, and legacy effect routes each call `redirect()` directly. Protected pages build sign-in and unauthorized redirects inline. `robots.ts` has its own disallow list, while protected pages separately use `buildPageMetadata({ noIndex: true })`. Not-found, error, sign-in, unauthorized, and loading routes independently choose recovery links and labels.

The existing public route planning and site metadata tasks cover discoverable public URLs and canonical metadata. They do not cover the cross-cutting policy for non-content route outcomes: which routes redirect, which protected/status routes should be disallowed or no-indexed, which recovery links are canonical, and which loading labels represent route families. The current Interface is shallow because each file is tiny, but the policy knowledge is still duplicated across files.

## Proposed deepening opportunity

Create a status and redirect policy Module for non-content route outcomes. Its Interface should expose named policies for legacy redirects, protected-route redirects, crawler visibility, status-page recovery actions, and route-family loading labels. App Router files should remain as Next.js Adapters that call `redirect()`, return `MetadataRoute.Robots`, or render `StatusPageShell`, but the decisions should come from one Implementation.

This Module should consume the public href intent Module for recovery links once that exists. It should also consume the site metadata Module for no-index metadata and robots sitemap URL behavior, so crawler policy is not split between `robots.ts` and individual pages.

## Benefits

- **Module**: Turns redirect/status/crawler decisions into a named Module instead of one-off route file behavior.
- **Interface**: Gives App Router files a small policy Interface such as "legacy route target", "protected denial target", "status recovery links", and "robots rules".
- **Implementation**: Keeps redirect targets, no-index/disallow rules, status-page links, and loading labels in one place.
- **Depth**: Increases Depth because simple route Adapters get several coordinated behaviors from a compact policy Interface.
- **Seam**: Makes the Next.js route-file Seam explicit: App Router files perform framework actions while policy lives behind the Module.
- **Adapter**: `src/app/robots.ts`, redirect pages, status pages, and loading pages become concrete Adapters over shared route outcome policy.
- **Leverage**: Changing the canonical public recovery path or protected-route crawler policy updates redirects, robots, metadata, and status pages together.
- **Locality**: SEO/navigation regressions around stale redirects, indexable protected pages, or inconsistent recovery links are debugged in one policy Implementation.

## Test plan

- Add unit tests for legacy redirects: `/` to `/substances`, `/data` to `/about`, `/interactions` to `/substances`, and `/effect/:effectSlug` to `/effects/:effectSlug`.
- Add tests for protected-route policy covering unauthenticated `/dev`, non-editor `/dev`, `/dev/profile`, sign-in callback handling, and unauthorized `from` handling.
- Add tests that every no-index status/protected route has a matching robots disallow rule or an explicit reason it does not need one.
- Add snapshot-style tests for status recovery link intents and loading labels by route family.
- Run `npm run typecheck` and targeted route tests.

## Risk/rollout notes

Keep the first pass behavior-preserving. Redirect status codes, callback URL encoding, and protected-route access rules should not change as part of the architecture work. Treat crawler policy changes as a separate rollout because robots and metadata changes can affect SEO after deployment.
