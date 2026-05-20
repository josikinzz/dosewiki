# Gap: Replication Media Operations Workspace

## Files

- `convex/replications.ts`
- `convex/subjectiveEffects.ts`
- `scripts/replications/scan-replications.mjs`
- `scripts/replications/assign-image-effects.mjs`
- `scripts/replications/upload-replications.mjs`
- `scripts/replications/migrate-replication-media.mjs`
- `scripts/replications/create-gallery-order.mjs`
- `scripts/replications/fix-replication-effect-slugs.mjs`
- `scripts/replications/lib/reconciliation.mjs`
- `src/features/effects/components/ReplicationGallery.tsx`
- `src/app/_components/public-routes/EffectReplicationsSection.tsx`

## Problem

Replication media work is spread across one Convex Module and many one-off scripts. The scripts each know pieces of the same Interface: local ESEI filesystem paths, metadata JSON locations, effect slug aliases, gallery order derivation, dry-run versus execute mode, Convex URL and admin key selection, upload URL caching, media metadata extraction, placeholder storage IDs, and public URL fallback behavior.

That makes the current Module shape shallow. The Implementation for scanning, reconciling, uploading, importing, fixing URLs, and connecting galleries is duplicated across scripts, while the Interface is effectively "run the right script with the right local paths and flags." The existing public effect article task covers rendering fetched replications, but it does not cover the operational seam that creates and maintains replication records, storage IDs, and gallery order.

## Proposed Deepening Opportunity

Introduce a replication media operations workspace Module with a small Interface around the domain operations:

- scan source media into normalized replication metadata
- reconcile legacy effect names and replication-specific overrides into canonical effect slugs
- plan uploads and metadata mutations as dry-run artifacts
- execute Convex storage uploads and replication mutations through one Convex Adapter
- derive subjective effect gallery order from the same reconciled metadata
- validate public URL resolution and placeholder storage handling

The existing scripts should become thin CLI Adapters that parse flags, load environment, and call the workspace. `convex/replications.ts` should keep the runtime query/mutation Adapter role, but shared rules such as storage URL fallback, placeholder storage IDs, and replication record validation should be expressed through a narrower Module Interface that scripts and public read code can both respect.

## Benefits

- **Module**: turns the replication import/upload/gallery flow into a named Module rather than a folder of operational scripts with overlapping rules.
- **Interface**: gives maintainers one Interface for planning and executing replication media changes instead of requiring knowledge of every script's flags, path constants, and Convex assumptions.
- **Implementation**: concentrates filesystem scanning, slug reconciliation, upload planning, mutation execution, and gallery derivation in one Implementation with focused helpers.
- **Depth**: increases Depth because callers ask for a replication media plan or execution result while the Module hides path resolution, slug aliases, storage fallback, and Convex mutation sequencing.
- **Seam**: makes the seam between local media metadata and Convex replication records explicit.
- **Adapter**: separates local filesystem, ESEI export JSON, Convex HTTP client, Convex storage, and public rendering as concrete Adapters rather than mixing them in each script.
- **Leverage**: one dry-run plan can support upload, URL repair, effect-slug repair, and gallery-order updates without reimplementing comparison logic.
- **Locality**: bugs in legacy slug aliases, placeholder storage handling, or gallery order drift land in the workspace Module instead of being fixed script by script.

## Test Plan

- Add unit tests for `canonicalizeEffectSlug`, replication override application, duplicate-preserving gallery order removal, and metadata-to-gallery-order derivation.
- Add fixture tests for scan output from a small synthetic media tree with image and video filenames, missing artist names, and legacy effect folder names.
- Add planning tests that compare desired metadata against mocked Convex replication/effect records and assert create, update, upload, stale-gallery, and no-op cases.
- Add Adapter tests with mocked Convex client methods for upload URL generation, storage ID updates, replication insertion/update, and subjective effect gallery order mutation.
- Run `npm run typecheck` and the focused replication workspace tests before using any execute mode.

## Risk/Rollout Notes

Do not replace all scripts at once. First move pure reconciliation and planning into the workspace while keeping existing script outputs unchanged. Then migrate one low-risk script, such as gallery-order creation, to the new Interface and compare dry-run output with the current script. Only after parity is clear should upload and media migration scripts use the shared execution Adapter.

Because replication media touches Convex storage and public effect pages, execute mode should default to explicit dry-run artifacts and require `CONVEX_ADMIN_KEY`. Production rollout should be limited by effect slug or upload count until URL resolution, gallery ordering, and public `ReplicationGallery` rendering have been smoke-tested.
