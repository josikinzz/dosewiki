# Security Admin Key Intent Tokens

## Files

- `convex/lib/auth.ts`
- `convex/substanceIndex.ts`
- `convex/prompts.ts`
- `convex/quotes.ts`
- `convex/contributorProfiles.ts`
- `convex/articleSources.ts`
- `convex/replications.ts`
- `src/app/api/save-to-convex/route.ts`
- `src/app/api/save-prompt/route.ts`
- `src/app/api/save-quote/route.ts`
- `src/app/api/save-user-profile/route.ts`
- `scripts/admin/convex-admin.mjs`
- `scripts/batch/`
- `scripts/convex/`
- `scripts/migrate/`

## Problem

`CONVEX_ADMIN_KEY` is a single bearer secret accepted by many Convex mutations through an optional `apiKey` argument. That key is used by editor HTTP routes, batch generation, migration scripts, replication scripts, and generic admin tooling. Once a caller has the key, the Convex Interface does not distinguish a prompt sync from a substance write, a profile media update, or a full migration. The existing write-intent work would centralize role checks, but it still treats the script/admin adapter as one broad capability.

This makes the admin-key Module shallow from an abuse-resistance perspective. The Interface is "pass the shared key into whatever mutation accepts `apiKey`", while the Implementation relies on caller discipline and script naming to preserve intent, blast radius, and rotation safety.

## Proposed deepening opportunity

Create an admin intent token Module behind the Convex authorization seam. Its Interface should validate a token for a named operation intent such as editor article write, prompt migration, quote migration, profile media write, replication maintenance, or production sync. The Implementation can initially adapt the existing `CONVEX_ADMIN_KEY` into one legacy token, then evolve toward separate env-backed secrets or signed short-lived tokens per intent.

Convex mutations should request an authorized script actor for a specific intent instead of accepting a generic `apiKey`. App Router routes and scripts become adapters that obtain the right token for their operation. The existing `CONVEX_ADMIN_KEY` can remain as a compatibility adapter during rollout, but it should be isolated behind the new Module rather than passed through every mutation Interface.

## Benefits

- **Module**: turns the broad admin key into an operation-intent Module instead of a raw secret convention.
- **Interface**: mutations request a named admin intent rather than accepting any valid `apiKey`.
- **Implementation**: token lookup, legacy-key compatibility, rotation windows, actor labeling, and audit metadata live behind the Module.
- **Depth**: a small intent Interface hides secret format, source, rotation, and script-vs-route rules.
- **Seam**: Convex authorization becomes the seam where bearer secrets are translated into authorized actors.
- **Adapter**: HTTP routes, batch scripts, migration scripts, and the generic admin CLI become adapters over intent tokens.
- **Leverage**: a leaked prompt-migration token would not automatically authorize article, profile, or replication writes once scoped tokens are introduced.
- **Locality**: future rotation, expiry, and audit changes happen in one admin-token Implementation instead of every route and script.

## Test plan

- Add Convex tests for each admin intent proving that valid scoped tokens authorize only the intended mutation family.
- Add compatibility tests proving the legacy `CONVEX_ADMIN_KEY` adapter preserves current behavior while it is enabled.
- Add negative tests proving a prompt token cannot write substances, profiles, replications, or article sources.
- Add script adapter tests that assert each script requests the expected intent and redacts token material in logs.
- Add audit tests that authorized script actors include intent name, adapter name, and safe actor metadata.

## Risk/rollout notes

Start with a no-behavior-change adapter that maps `CONVEX_ADMIN_KEY` to all intents, then add optional scoped token env vars one family at a time. Avoid breaking production sync and migration scripts during the first pass. Once scoped tokens are in use, rotate the legacy key and remove broad fallback from production before removing it from local development.
