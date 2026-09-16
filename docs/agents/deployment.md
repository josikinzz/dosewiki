# Deployment

This is the current authority for Vercel project routing, build separation, required runtime configuration, release preconditions, expected results, and recovery. Historical release detail removed from this guide is retained in the private housecleaning snapshot.

## Production topology

| Surface         | Vercel project       | Hosts                                        | Build contract                                         | Write posture                                                                       |
| --------------- | -------------------- | -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Public DoseWiki | `dosewiki-public`    | `dose.wiki`, `www.dose.wiki`                 | `DOSEWIKI_BUILD_SURFACE=public`, DoseWiki flavor       | No admin credential                                                                 |
| Editor DoseWiki | `dosewiki-admin`     | `dev.dose.wiki`, `dosewiki-admin.vercel.app` | `DOSEWIKI_BUILD_SURFACE=editor`, DoseWiki flavor       | Only project allowed to carry the general admin and editorial write credential tier |
| Effect Index    | Effect Index project | `effectindex.com`                            | public artifact, `NEXT_PUBLIC_SITE_FLAVOR=effectindex` | Credential-free and read-only                                                       |

Public hosts redirect `/dev`, `/review`, `/sign-in`, and `/unauthorized` to `dev.dose.wiki`. Credentialed APIs stay unavailable on public origins. Editor hosts remain `noindex`, return private/no-store caching directives, and must never receive a public alias. `src/config/siteFlavor.ts`, `lib/next/flavorGatedRoutes.ts`, and `middleware.ts` own route and host behavior.

`vercel.json` disables Git-triggered deployments for `main` and
`no-corpus-drain`. This keeps workflow and generated-pack pushes from
deploying application code. Explicit releases still follow the sequence
below. Vercel's `gitProviderOptions.createDeployments` controls GitHub
deployment records, not this build-suppression boundary.

## Runtime configuration

All three production projects use:

- `DATA_BACKEND=postgres`
- `POSTGRES_POOLED_URL`
- `REPLICATION_MEDIA_BASE_URL`

The local native source requires `DATA_ADMIN_KEY`, approved editorial `DATA_ADMIN_TOKEN_*` values, and `GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT` only on the editor. Public DoseWiki may hold only `DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE` for the fixed create-only intake allowlist; it must carry no general admin or editorial credential. Effect Index remains credential-free and forwards signup intake to the approved receiver. A missing media base is a failed deployment because replication reads can silently lose rows. These are release prerequisites, not evidence that provider environments already use the renamed values; the exact mapping and no-alias contract are in [data credentials](data-credentials.md#credentials-and-freeze).

`DATA_WRITES_FROZEN=1` closes all application and operator write boundaries. Keep it set during a recovery freeze. Unsetting it is a production action, not a documentation or source-code decision.

Convex `glad-minnow-656` is not the normal runtime or write target. It remains a frozen recovery source through the ticket 24 observation decision. Keep its mailing-list relay and recovery inputs intact until the owner completes ticket 24. Do not retire Convex, drop `pre-cutover-2026-09-10`, rotate migration credentials, or delete the cutover snapshot without that explicit decision.

## Build and release sequence

Preconditions:

1. Obtain explicit authorization for the exact projects, source revision, environment changes, aliases, and rollback targets.
2. Confirm the source revision is present in each isolated release tree.
3. Confirm each project's build surface and site flavor match the topology table.
4. Confirm public and Effect Index environments contain no admin credential.
5. Confirm the editor environment has every handler environment value required by `lib/postgres/runtime/deploymentEnv.ts`.
6. Inspect [data credentials](data-credentials.md) before any data-changing step. A deploy does not authorize a data write.

Build with the package-owned Vercel path:

```bash
bun install --frozen-lockfile
bun run build:vercel
```

The build must use webpack and produce the surface-specific artifact audit. A public build is acceptable only when the audit reports no protected editorial browser modules. Do not set `NEXT_PUBLIC_EDITOR_BUILD` directly and do not treat dead-code elimination as artifact separation.

The webpack filesystem cache version includes the resolved Next deployment ID.
Keep this dimension when changing cache configuration: Next font stylesheets
embed deployment-qualified URLs, and reusing compiled CSS across deployment IDs
can make its font URLs disagree with HTML preloads, downloading the same font
twice. Verify consecutive cached builds with different IDs. Do not clear
`.next/cache` or disable preload/skew protection to hide the mismatch.

Stage scheduler ownership in each isolated release tree before uploading it.
The shared root `vercel.json` contains all six jobs; it is not a surface-aware
scheduler configuration. Only the editor keeps `/api/cron/publication-delivery`
and `/api/cron/translation-refresh`. Public DoseWiki and Effect Index keep the
three `/open-data/` jobs and `/api/warm`, with both writer jobs removed.
The integrated release retains its exact inputs as
`runs/postgres-import/2026-09-15T02-25-03Z-integrated-production-release/vercel-public-config.json`
and `vercel-editor-config.json`. Preserve the rest of the routing and build
configuration. After promotion, verify the provider's cron definitions and
their deployment ID, not just the local JSON.

Release order:

1. Build and inspect public DoseWiki, editor DoseWiki, and Effect Index independently.
2. Deploy without changing aliases.
3. Inspect the deployment result and its artifact audit.
4. Assign only the authorized aliases to the matching artifact.
5. Check public reading, editor anonymous redirects and private headers, Effect Index route gating, and the exact changed behavior.

Publication signals are wire version 2. A version 2 sender is rejected by a
version 1 receiver, so deploy the public receivers before the editor sender.
Durable pending rows retry, so a staggered release delays a warm signal rather
than losing it. The persisted outbox stores targets, not the wire version, so
no data migration is involved.

`/[slug]` prerenders every directly reachable substance article, so a release
builds around 575 article pages and takes correspondingly longer. Warming is
verification, not generation: `scripts/deploy/warm-public-routes.mjs` requests
the HTML and the App Router navigation response for each URL and fails a URL
whose navigation response is not a complete `text/x-component` body. Point it
only at the public host. Reader-visible navigation cost lives in the
navigation response, so an all-green HTML warm is not evidence that in-site
navigation is warm.

`--skip-domain` is not proof that every alias is absent. The Josiekins static
staging deployment received its default project alias while
`autoAssignCustomDomains` remained false; both custom canonical aliases and
the production target stayed on the retained deployment. Inspect canonical
domain bindings separately from generated/default aliases before promotion.

Pass `--scope josies-projects-f217d517` explicitly to `vercel promote`,
including rollback promotions. In CLI 50.22.1, `VERCEL_ORG_ID` alone did not
populate the promotion command's `config.currentTeam`; its preflight rejected
correctly owned deployments before any promotion POST. Read-only inspection
with the explicit scope succeeded. A failed production step still triggers
the release halt policy; diagnosing this flag does not authorize a retry.

Expected result: each host serves only its intended flavor and artifact; public surfaces remain readable; editor documents and APIs remain protected; read-only projects have no write capability. A successful local build or source fix is not evidence that production changed.

### Native completion release prerequisites

The owner approved an integrated repairs-plus-native production release on 2026-09-15, superseding the earlier repairs-first sequence. The approved scope includes the three DoseWiki projects and Josiekins, migration 0015, scoped configuration, editor-only R2 CORS, and bounded synthetic acceptance. Previous compatible Postgres deployments and their configuration remain the rollback targets; rollback never flips to frozen Convex. The current execution state is recorded in the [completion follow-up](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#production-execution-2026-09-15).

The signup receiver needs approved migration `0015_shared_signup_rate_limits`, its table privileges, and `MAILING_LIST_IP_HASH_SECRET` before it can serve shared budgets. Media writes need the exact editor R2 endpoint, bucket, access key, secret, and delivery base read by `lib/runtime/r2MediaStorage.ts`, with storage permissions reviewed separately from database write authorization. The source adds preflight queries `contributorProfiles:authorizeAvatarUpload` and `replications:authorizeMediaUpload`; these are not write-allowlist entries. New upload and rendition writes, including `replications:insertMediaAsset` and `replications:updateMediaRenditions`, require review of the specific application or operator authorization boundary. Implementing the callable does not authorize a production operator workflow or expand its allowlist. Do not broaden service intake permissions to make media work.

Replication Studio performs a browser `PUT` to the private R2 S3 endpoint. Approve CORS for the exact editor origin and bucket, `PUT`, and the signed request headers `authorization`, `content-type`, `if-none-match`, `x-amz-content-sha256`, `x-amz-date`, and `x-amz-meta-sha256`; verify real preflight and create-only upload behavior before release. Do not add wildcard origins, public bucket access, or overwrite/delete grants. Avatar uploads are server-side and do not justify additional browser origins. Local fixtures do not establish live CORS, permissions, or successful production uploads.

Exact release, synthetic-data, observation, and retirement gates are recorded in the [completion follow-up](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#completion-dossier-follow-up-local-source-only). Each provider safety check still requires interactive approval at the point of risk.

### Localized publication-index cutover

Migrations `0012_localized_publication_indexes` and
`0013_localized_publication_index_triggers` introduce a producer/read-model
dependency. Review their generated SQL and the
`translate:publication-index` dry-run before any production mutation.

1. Rehearse migrations, projection parity and concurrent publication locally.
2. Apply only the approved additive migrations through `postgres:migrate`.
   Confirm runtime ownership/privileges and the exact backfill classification.
3. Replace the editor publication/translation producers before switching public
   readers. Drain old requests and cron workers, and keep old operator binaries
   stopped through cutover.
4. Complete the reviewed backfill and confirm every published article has clean
   metadata. Do not infer readiness from a previously cached index document.
5. Build and inspect the production-target public artifacts, including the
   Chinese index and the real Worker-rendition withdrawal canary, before aliasing.

If rollback is required, restore public reader aliases before old producer
aliases. Under the same writer barrier, disable only this feature's four
invalidation/locking triggers before old producers resume; otherwise they can
strand dirty metadata or recreate the old lock-order inversion. Retain the
projection tables and recovery journal. Trigger deactivation is a separately
reviewed, non-destructive rollback action, not a general safety bypass.

The 2026-09-14 withdrawal-cache rollback retained migrations 0012 and 0013
and the nine metadata rows while temporarily disabling the four feature
triggers. `WITHDRAWAL-REPAIR-1` subsequently applied generated migration
`0014_restore_localized_publication_index_triggers` and refreshed all nine rows
under the frozen editor barrier. Its producer is
`scripts/postgres/localizedPublicationIndexTriggers.ts` with `--restore`.
Future restoration episodes require a new generated, versioned migration;
never rewrite applied SQL or rerun 0013. The same four-trigger disable remains
the non-destructive rollback, with tables, migration history, and recovery
records retained. Media release gates are documented in
[`docs/replication-media-delivery.md`](../replication-media-delivery.md).

## Data publication and recovery

Editorial writes occur on the editor surface and invalidate public caches through the signed publication path. The editor project cannot directly expire another project's cache. Keep target allowlists exact and preserve revision verification before calling publication complete.

If an application release fails before an alias change, leave production aliases untouched. If it fails after an alias change, restore the previously recorded deployment for that exact project and scope.

Do not flip `DATA_BACKEND` during recovery. This checkout supports only Postgres. Restore the previous compatible Postgres artifact and configuration for application rollback. Exceptional historical database recovery is outside this repository's executable operator surface and requires fresh owner approval plus an isolated historical checkout; [the retained release manifest](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex) records evidence, not a current runnable procedure.

## Ownership pointers

- Build and script names: `package.json`
- Build wrapper: `scripts/deploy/vercel-build.mjs`
- Artifact separation: `next.config.ts` and `scripts/build/editor-artifact-audit.mjs`
- Host and route gates: `middleware.ts`
- Flavor contract: `src/config/siteFlavor.ts`
- Runtime diagnostics: `lib/runtime/envContract.ts`
- Postgres handler environment: `lib/postgres/runtime/deploymentEnv.ts`
- Data write ceremony: [data credentials](data-credentials.md)
- Post-cutover recovery: [release manifest section 10](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex)
- Translator and glossary access/import contract: `src/lib/auth/roles.ts`, `src/features/dev/devTabRegistry.ts`, and `src/app/api/dev/translation-glossary/`
