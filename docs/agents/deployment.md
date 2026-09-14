# Deployment

This is the current authority for Vercel project routing, build separation, required runtime configuration, release preconditions, expected results, and recovery. Historical release detail removed from this guide is retained in the private housecleaning snapshot.

## Production topology

| Surface | Vercel project | Hosts | Build contract | Write posture |
| --- | --- | --- | --- | --- |
| Public DoseWiki | `dosewiki-public` | `dose.wiki`, `www.dose.wiki` | `DOSEWIKI_BUILD_SURFACE=public`, DoseWiki flavor | No admin credential |
| Editor DoseWiki | `dosewiki-admin` | `dev.dose.wiki`, `dosewiki-admin.vercel.app` | `DOSEWIKI_BUILD_SURFACE=editor`, DoseWiki flavor | Only project allowed to carry the write credential tier |
| Effect Index | Effect Index project | `effectindex.com` | public artifact, `NEXT_PUBLIC_SITE_FLAVOR=effectindex` | Credential-free and read-only |

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

Only `dosewiki-admin` may carry `CONVEX_ADMIN_KEY`, intent-scoped `CONVEX_ADMIN_TOKEN_*` values, and `GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT`. Public DoseWiki and Effect Index must stay read-only. A missing media base is a failed deployment because replication reads can silently lose rows.

`DATA_WRITES_FROZEN=1` closes all application and operator write boundaries. Keep it set during a recovery freeze. Unsetting it is a production action, not a documentation or source-code decision.

Convex `glad-minnow-656` is not the normal runtime or write target. It remains a frozen recovery source through the ticket 24 observation decision. Keep its mailing-list relay and recovery inputs intact until the owner completes ticket 24. Do not retire Convex, drop `pre-cutover-2026-09-10`, rotate migration credentials, or delete the cutover snapshot without that explicit decision.

## Build and release sequence

Preconditions:

1. Obtain explicit authorization for the exact projects, source revision, environment changes, aliases, and rollback targets.
2. Confirm the source revision is present in each isolated release tree.
3. Confirm each project's build surface and site flavor match the topology table.
4. Confirm public and Effect Index environments contain no admin credential.
5. Confirm the editor environment has every handler environment value required by `lib/postgres/runtime/deploymentEnv.ts`.
6. Inspect [data credentials](convex-credentials.md) before any data-changing step. A deploy does not authorize a data write.

Build with the package-owned Vercel path:

```bash
bun install --frozen-lockfile
bun run build:vercel
```

The build must use webpack and produce the surface-specific artifact audit. A public build is acceptable only when the audit reports no protected editorial browser modules. Do not set `NEXT_PUBLIC_EDITOR_BUILD` directly and do not treat dead-code elimination as artifact separation.

Release order:

1. Build and inspect public DoseWiki, editor DoseWiki, and Effect Index independently.
2. Deploy without changing aliases.
3. Inspect the deployment result and its artifact audit.
4. Assign only the authorized aliases to the matching artifact.
5. Check public reading, editor anonymous redirects and private headers, Effect Index route gating, and the exact changed behavior.

Expected result: each host serves only its intended flavor and artifact; public surfaces remain readable; editor documents and APIs remain protected; read-only projects have no write capability. A successful local build or source fix is not evidence that production changed.

## Data publication and recovery

Editorial writes occur on the editor surface and invalidate public caches through the signed publication path. The editor project cannot directly expire another project's cache. Keep target allowlists exact and preserve revision verification before calling publication complete.

If an application release fails before an alias change, leave production aliases untouched. If it fails after an alias change, restore the previously recorded deployment for that exact project and scope.

If Postgres data must be rolled back to Convex, do not flip `DATA_BACKEND` and do not improvise a Convex command. Re-freeze writes and follow [release manifest section 10](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex). That full reverse export and replace import is rollback-only, writes production, and requires the owner at the keyboard with its production confirmation gates.

## Ownership pointers

- Build and script names: `package.json`
- Build wrapper: `scripts/deploy/vercel-build.mjs`
- Artifact separation: `next.config.ts` and `scripts/build/editor-artifact-audit.mjs`
- Host and route gates: `middleware.ts`
- Flavor contract: `src/config/siteFlavor.ts`
- Runtime diagnostics: `lib/runtime/envContract.ts`
- Postgres handler environment: `lib/postgres/runtime/deploymentEnv.ts`
- Data write ceremony: [data credentials](convex-credentials.md)
- Post-cutover recovery: [release manifest section 10](../../notes-and-plans/plans/convex-to-planetscale/release-manifest.md#10-post-write-rollback-postgres-to-convex)
- Translator and glossary access/import contract: `src/lib/auth/roles.ts`, `src/features/dev/devTabRegistry.ts`, and `src/app/api/dev/translation-glossary/`
