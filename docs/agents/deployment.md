# Deployment

This repo is linked to Vercel. Treat this file as the repo-local deployment/account routing source of truth.

## Vercel

- Account scope: `personal`
- Org ID: `team_mjd3LTYIDSudCGd7HeBhd04R`
- Project ID: `prj_XzisetSDrUgXiQO54FrHXdNNaHfO`
- Project name: `dosewiki-admin`

### Domain routing invariant

- `dosewiki-admin` at `https://dosewiki-admin.vercel.app/` is the full app/admin
  deployment.
- Keep `dose.wiki` and `www.dose.wiki` construction-gated through
  **2026-08-31**. The date is a floor, not an automatic launch: after it passes,
  keep the gate until the user explicitly authorizes the public launch.
- During `/push`, deploy the full app to `dosewiki-admin`; do not alias that
  deployment to `dose.wiki` or `www.dose.wiki`.
- If the public domains are attached to this Vercel project, `middleware.ts`
  must keep the host gate that redirects non-homepage requests on `dose.wiki` /
  `www.dose.wiki` back to `/`.
- The construction-host gate passes the read-only `/api/v1` API and its descendants.
- It also passes `/api/csp-report` because the enforced CSP uses `report-uri`.
- That endpoint accepts only size-limited, rate-limited, redacted violation reports.
- It does not expose application data or editor APIs.
- Keep `NEXT_PUBLIC_SITE_URL` pointed at the crawlable full-app host
  (`https://dosewiki-admin.vercel.app` or the active admin preview URL) while the
  public hosts are gated. Switch it to `https://dose.wiki` only after the launch
  floor has passed and the user has explicitly authorized launch.
- `NEXT_PUBLIC_SITE_FLAVOR` picks the publication identity at build time: unset / unrecognised = dose.wiki, `effectindex` = Effect Index. The `dosewiki-admin` project must leave it unset. A typo silently falls back to dose.wiki, so the build logs a runtime-env warning when the variable is set to an unrecognised value.
- Remote analytics must remain limited to the exact public host allowlist. PostHog initialises only on `dose.wiki`/`www.dose.wiki`, and only when `NEXT_PUBLIC_POSTHOG_KEY` is set; admin and Vercel preview HTML must not load it. Leave that variable unset on the Effect Index project so the credential-free deployment stays analytics-free.
- HTML responses must retain the path-split browser policy documented in [browser-security-policy.md](browser-security-policy.md): public documents use the static-compatible `script-src` (`'unsafe-inline'`, no nonce/hash) so ISR stays effective; `/dev` documents keep the strict nonce-plus-hash policy. Plain `'unsafe-eval'` remains forbidden everywhere.

## Effect Index (`effectindex.com`)

Effect Index is a **second Vercel project on the same repository and branch** as `dosewiki-admin`, built with the same install and build commands (`vercel.json`: `bun install --frozen-lockfile` / `bun run build:vercel`). Nothing about it is a fork — the only difference is its environment. That single shared build command is the central constraint on everything in the next section: whatever the build does, it does on a marketing deployment that must never hold write credentials.

## Shipping the app ships the Convex functions

**This changed.** The app build used to be a plain `next build`, so Convex
functions moved only on a manual `convex deploy` and an app release could
outrun the data layer — which is exactly how inline click-to-edit broke for a
day: `substanceIndex:setArticleField` was merged and built but never deployed to
`glad-minnow-656`.

`vercel.json` now runs `bun run build:vercel`, which is
[`scripts/deploy/vercel-build.mjs`](../../scripts/deploy/vercel-build.mjs). One
Convex invariant governs every build: local, development, Vercel Preview, and
Production environments all use `glad-minnow-656`. A Vercel Preview is an app
preview, not a Convex preview deployment.

| Build state | Required interpretation and action |
| --- | --- |
| Production build with the production key for `glad-minnow-656` | Expected. Run the checkout and strict drift checks, then `convex deploy --cmd 'bun run build'`; publish functions before building the app. |
| Preview or Development build with no deploy key | Expected. Check call sites, then build without publishing Convex functions. Keep every Convex URL on `glad-minnow-656`. |
| Production build with no deploy key | Verification-only. The app builds, but live drift cannot be checked or repaired; configure the Production key as described below. |
| Production key exposed to a Preview build | Configuration error. The wrapper defensively downgrades to verification-only; remove the key from the Preview environment. |
| Any Convex preview deploy key or preview deployment | Unsupported conflict with the production-only invariant. The wrapper still contains defensive preview-key branches, but they do not define a supported topology. Remove the preview key and point the app at `glad-minnow-656`. |
| Preview key exposed to a Production build | Configuration error; the wrapper refuses the build. Replace it with the production key for `glad-minnow-656`. |

One side effect to know about: `convex deploy --cmd` sets the framework's public
Convex URL variable (`NEXT_PUBLIC_CONVEX_URL`) for the build it runs, pointing at
the deployment it just published to. On `dosewiki-admin` that is
`glad-minnow-656`, the same value the project already sets, so nothing changes.
`CONVEX_PUBLIC_READ_URL` is untouched and still comes from the project settings.

**Why a wrapper rather than the canonical `npx convex deploy --cmd 'npm run
build'` directly in `vercel.json`:** that string is shared by both Vercel
projects. Effect Index is deliberately read-only — no `CONVEX_URL`, no
`CONVEX_ADMIN_KEY`, no auth secrets — and an unconditional `convex deploy` in
the shared command would either break its build outright or, if it were ever
handed a key to "fix" that, give a public marketing deployment a write path into
the production database. Keying the behaviour off `CONVEX_DEPLOY_KEY` means
Effect Index stays read-only **by the same omission it already relies on**: it
simply never gets the key, and it keeps building.

The verify path is not a rubber stamp. It still enforces the credential-free
half of the drift gate — every Convex function the app names must exist in this
checkout — and it prints `NOT VERIFIED` about the half it could not check
(the deployment's live function list, which needs a key). A build that verified
nothing does not report a pass.

Local builds never deploy, even if a key is present in the shell: `convex
deploy` publishes the working tree, and only a Vercel checkout is guaranteed to
be exactly one commit. Deploy production functions from a workstation with
`npm run convex:deploy -- --prod` (below), which guards the publish.

Drift still runs in both directions, and neither announces itself:

- **The app is ahead of the deployment.** A shipped UI calls a function the
  deployment never received. Production redacts every error to a bare
  `Server Error`, so the failure is undiagnosable at runtime. **Historical
  incident (2026-07-30):** `substanceIndex:setArticleField` was merged and built
  but never deployed to `glad-minnow-656`, which broke inline click-to-edit for
  a day. The build wrapper closes this direction when `CONVEX_DEPLOY_KEY` exists
  on the `dosewiki-admin` Production environment. Without that key, the build
  takes the verify path and says so.
- **The deployment is ahead of the working tree.** `convex deploy` publishes the
  **working tree**, not git HEAD, so any function live on the deployment but
  absent from the tree is **silently deleted** and the deploy still reports
  success. `mergeUnknownTwin` (`convex/replications.ts`) and `repairLegacyMedia`
  (`convex/subjectiveEffects.ts`) were historical instances; both are in the tree
  now, but the hazard class is permanent.

Check both directions before and after every Convex deploy:

```bash
npm run convex:check-functions -- --prod --strict   # before deploying
npm run convex:check-functions -- --prod            # after, to confirm
```

`--strict` fails on the silent-deletion direction as well, which is what you
want immediately before a deploy. `npm run convex:doctor` prints the same
comparison as a report. Both are read-only and need `CONVEX_DEPLOY_KEY_PROD` for
production; see [convex-credentials.md](convex-credentials.md), including the
note that the CI gate is inert until that key exists as a repository secret.

### Deploying Convex from a workstation

**Do not run `bunx convex deploy` by hand.** Use:

```bash
npm run convex:deploy -- --prod                            # gates only, publishes nothing
npm run convex:deploy -- --prod --from-head-worktree --confirm
```

[`scripts/deploy/convex-deploy.mjs`](../../scripts/deploy/convex-deploy.mjs)
runs the guards that a bare CLI call skips:

1. **Publish-surface cleanliness.** `convex deploy` publishes the working tree,
   not HEAD. Uncommitted changes under `convex/`, `convex.json`, `lib/`,
   `src/data/config/` or `package.json` all end up bundled, so the script
   refuses to deploy while any of them are dirty. Several agents share this
   checkout, so that is usually the case.
2. **`--from-head-worktree`** is the way through: it deploys out of a detached
   `git worktree` at HEAD with `node_modules` symlinked in, so what publishes is
   exactly one commit no matter what the main tree looks like. Uncommitted work
   is not published — the script says so before it runs.
3. **Strict drift check** against the target first, which is the guard for the
   silent-deletion direction.
4. **`--confirm`** is required to publish anything. Without it the gates run and
   the script stops.

#### When a guard trips

- **REFUSING: uncommitted change(s) in the publish surface** — commit them, or
  re-run with `--from-head-worktree` to publish HEAD and leave them behind.
- **AT RISK OF SILENT DELETION** — the listed function is live on the deployment
  and absent from what you are about to publish; deploying drops it and still
  reports success. Restore it, or confirm it was throwaway tooling that is safe
  to lose. Check HEAD for a specific one directly:

  ```bash
  git show HEAD:convex/replications.ts | grep -c mergeUnknownTwin
  ```

  A `0` means the function is not in HEAD.
- **MISSING from the deployment** — the app calls something no deployment has.
  That is the outage this whole section exists to prevent, and deploying is the
  fix.
- **Vercel build refuses with "preview key on a production build"** — the
  Production environment holds the wrong `CONVEX_DEPLOY_KEY`. Replace it with a
  production deploy key; do not delete the guard.
- **Vercel production build fails the pre-deploy drift check** — production has a
  function this commit does not, i.e. someone published from a workstation
  without committing. Commit the function and redeploy. If it really is
  disposable, set `CONVEX_DEPLOY_ALLOW_FUNCTION_DELETION=1` on that Vercel
  environment to let the build drop it, then remove the variable.

### Required configuration: only `dosewiki-admin` gets a deploy key

Inspect the Vercel environment before changing it:

1. In the `dosewiki-admin` project, confirm `CONVEX_DEPLOY_KEY` is scoped to the
   **Production** environment only. Preview and Development must remain
   unchecked.
2. If the variable is absent, mint a production deploy key for
   `glad-minnow-656`: Convex dashboard → production deployment → Settings →
   Deploy Keys → Generate Production Deploy Key. Add it to the Production scope
   identified in step 1.
3. If the existing variable uses any other deployment's key, replace it with the
   production key for `glad-minnow-656`.
4. **Do not add `CONVEX_DEPLOY_KEY` to the Effect Index project, in any
   environment.** Its absence is what keeps the read-only publication deployment
   read-only under a shared build command. Adding it there would give
   `effectindex.com` a write path into the production database.
5. Redeploy `dosewiki-admin` and read the build log. It must print
   `Convex functions WILL be deployed by this build`. If it prints
   `will NOT be deployed`, the variable is not visible to that build.
6. Redeploy Effect Index and confirm the opposite: it must print
   `will NOT be deployed` and build successfully.
7. Optionally add the same value as the `CONVEX_DEPLOY_KEY_PROD` **GitHub
   Actions secret** to switch on the CI half of the drift gate (next section).

When `dosewiki-admin` lacks its Production deploy key, every build takes the
verify path. Call-site checks still run, but the build cannot compare with or
update the live deployment.

### CI drift credential branch

The `Check Convex function drift against production` step in
`.github/workflows/vercel-policy-checks.yml` requires
`CONVEX_DEPLOY_KEY_PROD`. Without that repository secret it prints `SKIPPED` and
states that the check was not enforced. Adding the production key as that secret
turns on the live drift check; no workflow edit is required.

The credential-free checks run on every push:
`--checkout-only` call-site integrity and
`node scripts/deploy/check-build-command-wiring.mjs`. The wiring check guards the
single build-command string in `vercel.json`; changing it back to a plain
`bun run build` would restore the deployment gap without another failure.

### Environment variables the Effect Index project sets

| Variable | Value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_FLAVOR` | `effectindex` | Build-time publication identity. See `src/config/siteFlavor.ts`. Unset or unrecognised falls back to dose.wiki, so a typo here silently ships the wrong site. |
| `NEXT_PUBLIC_SITE_URL` | `https://effectindex.com` | Canonical origin for metadata, Open Graph, structured data and the sitemap. |
| `CONVEX_PUBLIC_READ_URL` | `https://glad-minnow-656.convex.cloud` | Server-side public reads, against **production** Convex. |
| `NEXT_PUBLIC_CONVEX_URL` | `https://glad-minnow-656.convex.cloud` | Browser Convex client, against **production** Convex. |

### Variables the Effect Index project deliberately omits

The omissions are the security posture, not an oversight. Leaving these unset
makes the deployment read-only:

- `CONVEX_DEPLOY_KEY` — the ability to publish Convex functions. With no key,
  the shared `bun run build:vercel` command verifies and never deploys. See
  [Shipping the app ships the Convex functions](#shipping-the-app-ships-the-convex-functions).
- `CONVEX_URL` — the explicit privileged write target. Compatibility resolution
  may still identify `NEXT_PUBLIC_CONVEX_URL`, but no write capability exists
  without an accepted admin credential.
- `CONVEX_ADMIN_KEY` and every `CONVEX_ADMIN_TOKEN_*` intent token — without an
  admin credential, `lib/convex/serverWriteCapability.ts` reports a
  configuration failure instead of returning a usable write client.
- `AUTH_SECRET` / `NEXTAUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
  `AUTH_ADMIN_EMAILS` — no sign-in, sessions, or admin membership.

Editor routes and `/sign-in` therefore fail on `effectindex.com`. That is the
intended read-only posture. Editing stays on `dosewiki-admin`; copying write
credentials to Effect Index would give a public marketing domain a production
write path.

`NEXT_PUBLIC_HOME_CONSTRUCTION_MODE` is **left unset** on the Effect Index project. Effect Index launches as a live public site, so it must not serve the holding page.

### The holding page is the homepage

There is one blocked surface, `src/app/_components/ConstructionLanding.tsx`: the
live homepage — real header, hero, tile grid, appearance cog — with every
destination answering "SOON" instead of navigating, and with the Theme Lab
withheld. It is reached two ways because the gate is:

- **Per host.** The middleware rewrites `/` on `dose.wiki` and `www.dose.wiki`
  to `/under-construction`. This is the production mechanism, and the only one
  that can hold one host back while the same build serves the full site on
  `dosewiki-admin`.
- **Per deployment.** `NEXT_PUBLIC_HOME_CONSTRUCTION_MODE=true` puts it at `/`
  for a whole build, on either flavor.

To see it locally, open `/under-construction`; no environment variable needed.

### dose.wiki project environment

The `dosewiki-admin` project leaves `NEXT_PUBLIC_SITE_FLAVOR` unset, which
selects the dose.wiki flavor. Its local, Development, Preview, and Production
Convex URLs must all resolve to `glad-minnow-656`; no environment mirrors or
substitutes a second Convex deployment. Launching Effect Index must not change
either rule.

### Domain arrangement

- `effectindex.com` is attached to the Effect Index Vercel project as its primary domain.
- `www.effectindex.com` is attached as a **redirect to the apex** `effectindex.com`.
- This is independent of the `dose.wiki` / `www.dose.wiki` construction-host gate described above, which stays on `dosewiki-admin`.

### Analytics domain (`analytics.dose.wiki`)

- `analytics.dose.wiki` is a **307 redirect to a public PostHog shared dashboard**, served by its own minimal Vercel project (`ph-redirect`). It contains no application code.
- It is deliberately **not** attached to `dosewiki-admin`. `analytics.dose.wiki` is absent from `PUBLIC_CONSTRUCTION_HOSTS`, so routing it through the app would fall past the construction gate and serve the full app — `/dev` included — at a third hostname.
- The redirect is tracked at `infra/analytics-redirect/vercel.json`. Redeploy it from a directory **outside this repository**, linking to the existing project so a bare deploy does not create a second one:

  ```sh
  d=$(mktemp -d) && cp infra/analytics-redirect/vercel.json "$d/" && cd "$d"
  vercel link --project ph-redirect --yes
  vercel deploy --prod
  ```

  Deploying from inside the repo instead makes the Vercel CLI walk up, find the root `.vercel` link, and upload the entire repository under the `dosewiki-admin` project.
- The share token in that file is public by design — the dashboard is world-readable. Rotate it by re-sharing in PostHog and redeploying.
- The subdomain previously served a self-hosted Umami instance on Railway, which only ever answered on this hostname (`i3voap3t.up.railway.app` itself returns 404). Restore it with `vercel dns add dose.wiki analytics CNAME i3voap3t.up.railway.app`; the `_railway-verify.analytics` TXT record is retained for exactly that.

### Caveat: content imports do not appear until a redeploy or revalidation

Public routes are prerendered (SSG) or incrementally revalidated. `PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS` in `lib/convex/publicData.cache.ts` is **900 seconds (15 minutes)**.

Importing content into Convex therefore does **not** immediately change the live site. A prerendered route keeps serving its build-time snapshot until either a redeploy regenerates it or the revalidation interval elapses. **This has already bitten this project once** — a completed import looked like a failed import because the pages had not regenerated. After any content import, either trigger a redeploy or wait out the interval before concluding anything is wrong.

### Post-deploy verification checklist

On `effectindex.com`:

- [ ] The homepage leads with the Subjective Effect Index and carries the Effect Index description.
- [ ] Primary navigation reads Effects, Replications, Substances, Trip Reports; About remains secondary and the homepage tile grid still omits Substances.
- [ ] The blog and all four supporting pages resolve: `/donate`, `/contact`, `/discord`, `/copyright-disclaimer`.
- [ ] A sample effect, substance, report, article and replication page each render.
- [ ] Page source shows Effect Index in the `<title>`, the Open Graph tags and the JSON-LD structured data.
- [ ] `/sitemap.xml` lists the Effect Index-only routes.
- [ ] `/sign-in` and the editor routes fail — confirm this, it is the expected read-only posture.

On `dose.wiki` / `dosewiki-admin`:

- [ ] Appearance unchanged.
- [ ] Both appearance axes work: the day/night toggle is a reader preference on
  both publications, and dose.wiki additionally exposes the Fun/Pro visual-style
  toggle. Effect Index locks the style to Pro and must not offer that control.
- [ ] The blog resolves. Effect Index-only routes return 404: `/donate`, `/contact`, `/discord`, `/copyright-disclaimer`, and `/documentation-style-guide`.

### Verifying the Effect Index build locally

A concurrent `next dev` server may own `.next`. Never run a bare `next build` against it. Temporarily add `distDir: process.env.NEXT_BUILD_DIST_DIR ?? ".next"` to `next.config.ts`, build with `NEXT_BUILD_DIST_DIR` set to a scratch directory, then revert the config and delete the scratch directory. Note that Next resolves `distDir` **relative to the project root**, so an absolute path lands under the repo — use a relative path such as `.next-ei`.

```bash
NEXT_BUILD_DIST_DIR=.next-ei \
NEXT_PUBLIC_SITE_FLAVOR=effectindex \
NEXT_PUBLIC_SITE_URL=https://effectindex.com \
CONVEX_PUBLIC_READ_URL=https://glad-minnow-656.convex.cloud \
NEXT_PUBLIC_CONVEX_URL=https://glad-minnow-656.convex.cloud \
bun run build
```

## Git

- Remote: `origin	https://github.com/josikinzz/dosewiki-admin.git (fetch)`

## Commands

Before GitHub-sensitive work, use:

```bash
gh auth switch -u josikinzz
```

Before Vercel-sensitive work, use explicit config:

```bash
vercel --global-config "$HOME/.vercel-personal" whoami
vercel --global-config "$HOME/.vercel-personal" deploy
```

Do not infer account scope from the repo name when this file has Vercel metadata.
