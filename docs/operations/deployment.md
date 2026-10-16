# Deployment

This is the current authority for Vercel project routing, build separation, required runtime configuration, release preconditions, expected results, and recovery. Historical release detail removed from this guide is retained in the private housecleaning snapshot.

## Production topology

| Surface         | Vercel project       | Hosts                                        | Build contract                                         | Write posture                                                                       |
| --------------- | -------------------- | -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Public DoseWiki | `dosewiki-public`    | `dose.wiki`, `www.dose.wiki`                 | `DOSEWIKI_BUILD_SURFACE=public`, DoseWiki flavor       | No admin credential                                                                 |
| Editor DoseWiki | `dosewiki-admin`     | `dev.dose.wiki`, `dosewiki-admin.vercel.app` | `DOSEWIKI_BUILD_SURFACE=editor`, DoseWiki flavor       | Only project allowed to carry the general admin and editorial write credential tier |
| Effect Index    | Effect Index project | `effectindex.com`                            | public artifact, `NEXT_PUBLIC_SITE_FLAVOR=effectindex` | Credential-free and read-only                                                       |

The release artifact names `public`, `editor`, and `effectindex` map to these
rows in `scripts/build/build-surface.mjs`, which derives every build fact from
the name: surface, flavor, build directory, cron ownership, the build inputs a
prebuilt upload keeps, its skew-protection ID, and its `.vercelignore` repair.
`next.config.ts`, `src/config/siteFlavor.ts`, the deploy scripts, and both
build workflows (through `scripts/build/build-surface-cli.mjs`) read it; change
the mapping there, not in workflow shell.

Only the public DoseWiki build prerenders substance articles, and only the
English high and normal tiers (`lib/next/prerenderPolicy.ts`). The editor
build, the Effect Index build, and every locale mirror render substance
articles on first request and hold them in the hourly ISR cache; the
required post-deploy warm below is what makes that first request cheap for a
reader. Record each artifact's actual page count with `bun run build:census`.

Public hosts redirect `/dev`, `/review`, `/sign-in`, and `/unauthorized` to `dev.dose.wiki`. Credentialed APIs stay unavailable on public origins. Editor hosts remain `noindex`, return private/no-store caching directives, and must never receive a public alias. `src/config/siteFlavor.ts`, `lib/next/flavorGatedRoutes.ts`, and `src/middleware.ts` own route and host behavior.

`vercel.json` disables Git-triggered deployments on every branch. This keeps
workflow and generated-pack pushes from deploying application code, and it
stops the per-PR previews that always failed: the preview environment holds
no database URL, so those builds stopped at the first data-backed page.
Builds for review come from the remote build workflow instead.
Explicit releases still follow the sequence
below. Vercel's `gitProviderOptions.createDeployments` controls GitHub
deployment records, not this build-suppression boundary.

### Reading-page editor launcher

For changes to reader-to-editor navigation, follow the [launcher contract](../architecture/runtime-and-data.md#reading-page-editor-launcher). Shortcuts do not grant write authorization.



## Runtime configuration

All three production projects use:

- `DATA_BACKEND=postgres`
- `POSTGRES_POOLED_URL`
- `REPLICATION_MEDIA_BASE_URL`

The local native source requires `DATA_ADMIN_KEY`, approved editorial `DATA_ADMIN_TOKEN_*` values, and `GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT` only on the editor. Public DoseWiki may hold only `DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE` for the fixed create-only intake allowlist; it must carry no general admin or editorial credential. Effect Index remains credential-free and forwards signup intake to the approved receiver. A missing media base is a failed deployment because replication reads can silently lose rows. These are release prerequisites, not evidence that provider environments already use the renamed values; the exact mapping and no-alias contract are in [data credentials](data-credentials.md#credentials-and-freeze).

`DATA_WRITES_FROZEN=1` closes all application and operator write boundaries. Keep it set during a recovery freeze. Unsetting it is a production action, not a documentation or source-code decision.

PlanetScale Postgres is the only runtime and write target. Do not rotate migration credentials or delete the cutover snapshot without an explicit owner decision.

## Build and release sequence

Preconditions:

1. Obtain explicit authorization for the exact projects, source revision, environment changes, aliases, and rollback targets.
2. Confirm the source revision is present in each isolated release tree.
3. Confirm each project's build surface and site flavor match the topology table.
4. Confirm public and Effect Index environments contain no admin credential.
5. Confirm the editor environment has every handler environment value required by `lib/postgres/runtime/deploymentEnv.ts`.
6. Inspect [data credentials](data-credentials.md) before any data-changing step. A deploy does not authorize a data write.

Every release build runs on Vercel's builders through the package-owned
command, `bun run build:vercel` (vercel.json's `buildCommand`). Nothing is
built on a laptop or on a GitHub runner.

### Where the build runs

Dispatch `.github/workflows/remote-build.yml` with the surface, the ref (a
branch, tag, or full commit SHA; a short SHA fails at checkout), the
surface's GitHub environment, and the target. The runner stages the surface's
cron jobs and uploads the source; Vercel builds it with the project's own
environment and assigns the deployment ID that skew protection uses. With
`target: production` the upload is a production deployment created with
`--skip-domain`: it serves the production environment at its own URL and
holds no domain. The release order below continues from step 3 with that
deployment. Dispatch one surface at a time, in release order. Capabilities
and limits: [security CI](security-ci.md#remote-build-workflow). The
environments and tokens are recorded in
[data credentials](data-credentials.md#remote-build-deploy-token).

The same upload works by hand from an isolated release tree (a detached
`git worktree` at the release commit, cron jobs staged, linked to the
project): `vercel deploy --prod --skip-domain --archive=tgz --yes`. If the
CLI loses its connection while it waits, the build continues on Vercel;
read its state with `vercel inspect <deployment id>`.

Why Vercel builds it:

- Vercel's 8-core builders complete every surface. On a standard
  GitHub-hosted runner, public builds were not reliable: a CPU-starved build
  worker held a read transaction open past the 30s
  `idle_in_transaction_session_timeout` the runtime sets, Postgres ended the
  session, and two public production runs failed after six attempts on one
  query (PlanetScale logs, 2026-09-23; a third failed the same way on
  2026-09-24). The database answers quickly (p99 29 ms); the read-only role
  shares a PgBouncer pool of 8 server connections (`default_pool_size`,
  `max_db_connections` 20 across all roles) on a PS-5 cluster. Do not
  lengthen the transaction timeouts to hide it.
- Blacksmith runners are not an option: Blacksmith supports GitHub
  organizations only, and this repository belongs to a personal account.
- A Vercel-hosted build gets its deployment ID from the platform, so skew
  protection and font URLs agree without the `DOSEWIKI_PREBUILT_DEPLOYMENT_ID`
  and `.vercelignore` repairs a prebuilt upload needs (both remain in
  `scripts/build/build-surface.mjs` for a prebuilt upload, which is no longer
  a release path).

Before promoting, confirm that a prerendered page (`/lsd`) and a page
rendered on request (`/effects/drifting`) carry only the new deployment's
`?dpl=` ID, and that the stylesheet's font URLs use the same ID. Deployment
URLs sit behind Vercel's login protection; read them with
`vercel curl <path> --deployment <url>`.

Run one release build at a time: three in parallel exhausted the read-only
role's database connections. The workflow's shared concurrency group queues
them, and GitHub keeps only one queued run, so dispatch surfaces in turn.

A `target: preview` deployment runs with the project's preview environment,
which holds no database URL, so pages rendered on demand fail there. Use it
for the artifact audit and timing only; a release uses `target: production`.

The build must use webpack and produce the surface-specific artifact audit. A public build is acceptable only when the audit reports no protected editorial browser modules. Do not set `NEXT_PUBLIC_EDITOR_BUILD` directly and do not treat dead-code elimination as artifact separation.

The webpack filesystem cache version includes the resolved Next deployment ID.
Keep this dimension when changing cache configuration: Next font stylesheets
embed deployment-qualified URLs, and reusing compiled CSS across deployment IDs
can make its font URLs disagree with HTML preloads, downloading the same font
twice. Verify consecutive cached builds with different IDs. Do not clear
`.next/cache` or disable preload/skew protection to hide the mismatch.

Static generation concurrency defaults to four workers rendering one page
each (`lib/next/buildConcurrency.ts`). `DOSEWIKI_BUILD_WORKERS` and
`DOSEWIKI_BUILD_PAGES_PER_WORKER` raise those numbers; set them in the Vercel
project's environment, which is where the build reads them. Raise in small steps and record every setting tried
here, with the census elapsed time and the peak PlanetScale connection count
observed during the build; a value this table does not support is not
authorized.

| Where                | Workers | Pages per worker | Elapsed | Peak connections | Recorded    |
| -------------------- | ------- | ---------------- | ------- | ---------------- | ----------- |
| Vercel builder (iad1), public DoseWiki | 4 | 1 | 11.3 min (1426 pages; 19.3 min before the diet) | not measured | 2026-09-23 |
| Vercel builder (iad1), editor | 4 | 1 | 12.8 min (1158 pages; 19.7 min before) | not measured | 2026-09-23 |
| Vercel builder (iad1), Effect Index | 4 | 1 | 5.4 min (1160 pages; 22.6 min before) | not measured | 2026-09-23 |
| Vercel builder (iad1), all three, second release | 4 | 1 | public 10.6 min, editor 12.3 min, Effect Index 4.6 min (`build-timing.json`) | not measured | 2026-09-23 |
| GitHub-hosted runner, Effect Index | 4 | 1 | 5m 52s build, 8 min run (census total 1055) | not measured | 2026-09-23 |
| GitHub-hosted runner, public and editor, before the read retry | 4, then 2 | 1 | failed: read-only connection terminated mid-build | not measured | 2026-09-23 |
| GitHub-hosted runner, public DoseWiki | 4 | 1 | 11m 06s build, 13.6 min run (census total 1321; one dropped connection rerun) | not measured | 2026-09-23 |
| GitHub-hosted runner, editor | 4 | 1 | 5m 38s build, 8 min run (census total 1053; one dropped connection rerun) | not measured | 2026-09-23 |
| GitHub-hosted runner, public DoseWiki, production target | 4 | 1 | 9m 31s and 15m 47s on two runs (census total 1321; up to 14 reruns); a third run failed after six attempts on one query | not measured | 2026-09-23 |
| GitHub-hosted runner, public DoseWiki, production target | 2 | 1 | failed: idle-in-transaction termination, then six query read timeouts on `/ru` | not measured | 2026-09-23 |
| Vercel builder (iad1), public DoseWiki, production target, source upload | 4 | 1 | 9.4 min (Vercel `buildingAt` to `ready`) | not measured | 2026-09-24 |

Stage scheduler ownership in each isolated release tree before uploading it.
`node scripts/deploy/stage-vercel-crons.mjs <public|editor|effectindex>` rewrites
the tree's `vercel.json` to the jobs below; the remote build workflow runs it
for every artifact.
The shared root `vercel.json` contains all seven jobs; it is not a surface-aware
scheduler configuration. Each release tree keeps only the jobs its project owns:

| Cron path                           | Schedule      | Owning project                            | Job                                            |
| ----------------------------------- | ------------- | ----------------------------------------- | ---------------------------------------------- |
| `/open-data/SubstanceIndex.json`    | `0 9 * * *`   | `dosewiki-public`, Effect Index project   | Daily open-data export                         |
| `/open-data/EffectIndex.json`       | `0 9 * * *`   | `dosewiki-public`, Effect Index project   | Daily open-data export                         |
| `/open-data/TripReports.json`       | `0 9 * * *`   | `dosewiki-public`, Effect Index project   | Daily open-data export                         |
| `/api/warm`                         | `0 * * * *`   | `dosewiki-public`, Effect Index project   | Hourly public route warming                    |
| `/api/cron/publication-delivery`    | `* * * * *`   | `dosewiki-admin` only                     | Publication outbox delivery (writer)           |
| `/api/cron/translation-bulk`        | `* * * * *`   | `dosewiki-admin` only                     | Bulk translation lane (writer)                 |
| `/api/cron/translation-refresh`     | `*/5 * * * *` | `dosewiki-admin` only                     | Incremental translation lane (writer)          |

Remove all three writer jobs from the public DoseWiki and Effect Index trees.
The integrated release retains its exact inputs as
`runs/postgres-import/2026-09-15T02-25-03Z-integrated-production-release/vercel-public-config.json`
and `vercel-editor-config.json`. A restaged editor config must carry all three
writer jobs, including `/api/cron/translation-bulk`, even if a retained input
lacks it.
Preserve the rest of the routing and build configuration. After promotion,
verify the provider's cron definitions and their deployment ID, not just the
local JSON.

Release order:

1. Build and inspect public DoseWiki, editor DoseWiki, and Effect Index independently.
2. Deploy without changing aliases.
3. Inspect the deployment result and its artifact audit.
4. Assign only the authorized aliases to the matching artifact.
5. Warm every public host immediately after the aliases move. Required, not
   optional: the substance articles a build does not prerender (see
   `lib/next/prerenderPolicy.ts`) render on their first request, and the ISR
   page cache did not survive the deploy.

   ```bash
   bun run warm:public-routes -- \
     --base-url https://dose.wiki,https://ru.dose.wiki,https://zh.dose.wiki,https://effectindex.com
   ```

   One invocation prints one summary per host and exits non-zero when any
   host exceeds the failure threshold. A host that lists nothing to warm is
   named in a warning; check it is a public host. Add every new locale mirror
   to the list when it launches.
6. Check public reading, editor anonymous redirects and private headers, Effect Index route gating, and the exact changed behavior.

Publication signals are wire version 2. A version 2 sender is rejected by a
version 1 receiver, so deploy the public receivers before the editor sender.
Durable pending rows retry, so a staggered release delays a warm signal rather
than losing it. The persisted outbox stores targets, not the wire version, so
no data migration is involved.

For prerender selection, inspect `lib/next/prerenderPolicy.ts` (the tiers per
locale and artifact) and `lib/next/staticParams.ts`; verify actual output
during an authorized build. `bun run build:census -- <build directory>` is the
step that records a release's page count: it reads the finished build's
prerender manifest and prints prerendered pages per route family beside the
wall-clock time `bun run build:vercel` recorded in `build-timing.json`. Paste
that output into the release record; a page count copied from a previous
release is not evidence.
`scripts/deploy/warm-public-routes.mjs` verifies both HTML and complete
`text/x-component` navigation responses on every public host it is given,
mirrors included (it rehosts the English sitemap onto each mirror, since
mirrors publish no sitemap of their own). HTML success alone does not prove
in-site navigation is warm.

For scheduled warming, `src/app/api/warm/route.ts` owns bounds, priority selection,
timeouts and query overrides; `vercel.json` owns scheduling. Keep the canonical
public target, CRON_SECRET authentication and rate-limit gate. Broader deployment
warming is an explicit branch, not routine whole-corpus work to hide expensive
queries. A CDN miss is not proof of a database read.

Imports that bypass the editor do not invalidate Next caches automatically.
Revalidation intervals are demand-driven, not timers that regenerate every
article. After an import, perform an authorized targeted revalidation or
redeployment and verify the canonical public response. Do not treat elapsed
time or an editor-host response as proof of public freshness.

Before promotion, inspect canonical domain bindings separately from generated
or default aliases: `--skip-domain` is not proof that every alias is absent.
Supply the exact authorized CLI team scope explicitly, including rollback;
an environment org ID alone may not select the promotion team. A failed
production step halts the release; diagnosis does not authorize a retry.

Expected result: each host serves only its intended flavor and artifact; public surfaces remain readable; editor documents and APIs remain protected; read-only projects have no write capability. A successful local build or source fix is not evidence that production changed.

### Native completion release prerequisites

Historical release receipts do not authorize a new release. Preserve compatible
Postgres artifact/configuration pairs for rollback.

The signup receiver needs approved migration `0015_shared_signup_rate_limits`, its table privileges, and `MAILING_LIST_IP_HASH_SECRET` before it can serve shared budgets. Media writes need the exact editor R2 endpoint, bucket, access key, secret, and delivery base read by `lib/runtime/r2MediaStorage.ts`, with storage permissions reviewed separately from database write authorization. The source adds preflight queries `contributorProfiles:authorizeAvatarUpload` and `replications:authorizeMediaUpload`; these are not write-allowlist entries. New upload and rendition writes, including `replications:insertMediaAsset` and `replications:updateMediaRenditions`, require review of the specific application or operator authorization boundary. Implementing the callable does not authorize a production operator workflow or expand its allowlist. Do not broaden service intake permissions to make media work.

Replication Studio performs a browser `PUT` to the private R2 S3 endpoint. Approve CORS for the exact editor origin and bucket, `PUT`, and the signed request headers `authorization`, `content-type`, `if-none-match`, `x-amz-content-sha256`, `x-amz-date`, and `x-amz-meta-sha256`; verify real preflight and create-only upload behavior before release. Do not add wildcard origins, public bucket access, or overwrite/delete grants. Avatar uploads are server-side and do not justify additional browser origins. Local fixtures do not establish live CORS, permissions, or successful production uploads.

Each provider safety check still requires interactive approval at the point of risk.

### Localized publication-index cutover

When releasing the compact localized reader or its producers, follow
[localized cutover](locale-mirrors.md#localized-publication-index-cutover).
That producer-before-reader dependency and reversed rollback order are additional
gates, not a replacement for public-receiver-before-editor-sender ordering above.

Before a localization release, run `bun run deploy:localization-preflight -- --target <runtime-url>`
once per surface with `DOSEWIKI_BUILD_SURFACE` set and the staged environment exported (the entry
loads no env file; remote targets also need `--allow-remote` and `POSTGRES_IMPORT_CONFIRM`). It checks the deployment env contract, the applied migrations against the
journal and latest snapshot, and the runtime role's grants on every runtime schema table, inside a
rolled-back read-only transaction. A passing preflight is evidence about that credential only; it
authorizes no release.



### Public read-index rollout

For index activation and backfill, follow [maintained public read indexes](../architecture/runtime-and-data.md#maintained-public-read-indexes).
Backfill readiness, release authorization and measured savings remain separate.



## Data publication and recovery

Editorial writes occur on the editor surface and invalidate public caches through the signed publication path. The editor project cannot directly expire another project's cache. Keep target allowlists exact and preserve revision verification before calling publication complete.

Proposal responses expose safe contributor names and a server-computed ownership
flag, not account emails or storage snapshots. Private ownership and review audit
fields remain stored server-side. Public changelog reads sanitize historical
email-bearing attribution, and new approval/revert entries omit account emails.
The application projects both legacy and current proposal responses safely and
uses dedicated changelog cache namespaces. No history deletion or data migration
is required. Previously delivered responses cannot be recalled.

If an application release fails before an alias change, leave production aliases untouched. If it fails after an alias change, restore the previously recorded deployment for that exact project and scope.

Do not flip `DATA_BACKEND` during recovery. This checkout supports only Postgres. Restore the previous compatible Postgres artifact and configuration for application rollback. Exceptional database recovery is outside this repository's executable operator surface and requires fresh owner approval.

## Ownership pointers

- Build and script names: `package.json`
- Build wrapper: `scripts/deploy/vercel-build.mjs`
- Artifact separation: `next.config.ts` and `scripts/build/editor-artifact-audit.mjs`
- Host and route gates: `src/middleware.ts`
- Flavor contract: `src/config/siteFlavor.ts`
- Runtime diagnostics: `lib/runtime/envContract.ts`
- Postgres handler environment: `lib/postgres/runtime/deploymentEnv.ts`
- Data write ceremony: [data credentials](data-credentials.md)
- Translator and glossary access/import contract: `src/lib/auth/roles.ts`, `src/features/dev/pages/devTabRegistry.ts`, and `src/app/api/dev/translation-glossary/`
