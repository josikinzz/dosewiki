# Deployment

This repo is linked to Vercel. Treat this file as the repo-local deployment/account routing source of truth.

## Vercel

- Account scope: `personal`
- Org ID: `team_mjd3LTYIDSudCGd7HeBhd04R`
- Project ID: `prj_XzisetSDrUgXiQO54FrHXdNNaHfO`
- Project name: `dosewiki-admin`

### Domain routing invariant

- `dosewiki-admin` is the one project. Four hosts are attached to it and one
  production deploy serves all of them: `dose.wiki` and `www.dose.wiki`
  (public), `dev.dose.wiki` and `dosewiki-admin.vercel.app` (editor).
- The public hosts launched early on 2026-08-30 after explicit user
  authorization. The social announcement remains scheduled for midnight at the
  start of 2026-08-31 in America/Los_Angeles. The hosts already serve ordinary
  App Paths and are crawlable.
- `middleware.ts` keeps host-specific boundaries: public-host `/dev`, `/review`,
  `/sign-in`, and `/unauthorized` links redirect to `dev.dose.wiki`.
  Credentialed endpoints (`/api/auth`, `/api/dev`)
  remain unavailable on the public origin because a cross-origin redirect would
  lose cookies and misreport the caller as signed out.
- Both editor hosts answer `Disallow: /` and an empty sitemap. They mirror the
  application for authenticated work and must not compete with the public site.
- The public read-only `/api/v1` API and `/api/csp-report` are available on the
  launched origin. The CSP endpoint accepts only size-limited, rate-limited,
  redacted violation reports; it exposes neither application data nor editor APIs.
- The dose.wiki flavor defaults its canonical base to `https://dose.wiki`.
  `NEXT_PUBLIC_SITE_URL` may override it only for an intentional alternate build.
- `NEXT_PUBLIC_SITE_FLAVOR` picks the publication identity at build time: unset / unrecognised = dose.wiki, `effectindex` = Effect Index. The `dosewiki-admin` project must leave it unset. A typo silently falls back to dose.wiki, so the build logs a runtime-env warning when the variable is set to an unrecognised value.
- Remote analytics must remain limited to the exact public host allowlist. PostHog initialises only on `dose.wiki`/`www.dose.wiki`, and only when `NEXT_PUBLIC_POSTHOG_KEY` is set; admin and Vercel preview HTML must not load it. Leave that variable unset on the Effect Index project so the credential-free deployment stays analytics-free.
- HTML responses must retain the path-split browser policy documented in [browser-security-policy.md](browser-security-policy.md): public documents use the static-compatible `script-src` (`'unsafe-inline'`, no nonce/hash) so ISR stays effective; `/dev` documents keep the strict nonce-plus-hash policy. Plain `'unsafe-eval'` remains forbidden everywhere.

#### Reading-page editor launcher

The bottom-right wrench appears only for contributor-or-higher sessions on the
two approved editor hosts. On the homepage it replaces the mailing-list entry
point; pending, failed, anonymous, and viewer sessions retain the mailing list.
The launcher is absent within editor, review, and authentication flows. Public
DoseWiki hosts and Effect Index do not load its session subtree or issue its auth
requests. The browser editor hint is not a prerequisite.

All actions are native links to existing editors, filtered by the dev registry's
role floors. This is a navigation convenience, not a new authorization boundary
or write API. Pages declare loaded record identity through
`src/features/editor-launcher/EditorLauncherTarget.tsx`; no arbitrary pathname
is interpreted as a substance.

| Reading surface | Contextual destination |
| --- | --- |
| Substance article | Substances for editor/admin; Molecules and Citations for admin |
| About | Pinned About record in Writing for editor/admin |
| Markdown `/articles/[slug]` and DoseWiki `/blog/[slug]` | Matching Writing record and kind for editor/admin |
| Open substance-scoped replication viewer | Matching substance in Replications for admin |
| VCode/unspecified writing formats, artist/effect/unscoped galleries | All dev tools only; no writable exact handoff |
| Reports, effects, chemical classes, taxonomy, indexes, search, contributors, static/form/multi-copy pages | All dev tools only |
| Redirect-only addresses | Destination owns context |
| Effect Index | No launcher |

The replication viewer hosts the same launcher inside its modal focus boundary.
Its menu portal remains inside that outlet for native fullscreen, and launcher
keyboard events do not drive viewer navigation. The existing inline gallery
editor and its desktop restriction are unchanged. Dev edits still target
production data; following a shortcut does not save anything.

#### Proposal and changelog email privacy

Proposal responses expose safe contributor names and a server-computed ownership
flag, not account emails or storage snapshots. Private ownership and review audit
fields remain stored server-side. Public changelog reads sanitize historical
email-bearing attribution, and new approval/revert entries omit account emails.

Deploy the Next application before the Convex functions for this DTO cutover.
The new application projects both legacy and current proposal responses safely;
an old application expects identity fields removed by the new functions.
The application also uses new changelog cache namespaces. Both deployments are
needed: the application protects rendered responses, while Convex protects
direct public queries and future publication writes. No history deletion or
data migration is required. Previously delivered responses cannot be recalled.

#### The domains were moved to `dosewiki-admin` on 2026-08-22

Until that date `dose.wiki` and `www.dose.wiki` were served by a separate,
abandoned Vercel project named `dosewiki` (`prj_KBYpmXeY5PJ2UcntD7w1qcq1J71O`),
whose last production deployment was from June 2026 — the edge response carried
`age: ~6.3e6` seconds, and its chunk set was disjoint from `dosewiki-admin`'s.
Anything merged here reached `dosewiki-admin.vercel.app` and nothing else, which
is why the public holding page looked nothing like the one in this repository.

Both domains now resolve to `dosewiki-admin`, so `main` reaches the public
hosts. The CLI cannot reassign a domain that is attached elsewhere
(`vercel domains add --force` still answers `already assigned to another
project`); it was done against the REST API, deleting
`/v9/projects/dosewiki/domains/<name>` and posting the name back to
`/v10/projects/dosewiki-admin/domains`. Nameservers were already Vercel's, so
neither domain needed re-verification.

The `dosewiki` project still exists and still holds `dosewiki.vercel.app`. It
serves nothing anyone links to; leave it alone or delete it, but do not deploy
to it.

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

  A `0` means the function is not in HEAD. When the removal is deliberate,
  acknowledge it by name so the gate passes for exactly that function:

  ```bash
  npm run convex:deploy -- --prod --from-head-worktree --confirm \
    --accept-deletion=memberships:upsertFromAuth
  ```

  Naming a function that is not at risk fails the gate, so a stale
  acknowledgement cannot linger in a command.
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
- `AUTH_SECRET` / `NEXTAUTH_SECRET`: no sessions. Sign-in also needs the
  admin credential above to read `memberships`, so it fails twice over.

Editor routes and `/sign-in` therefore fail on `effectindex.com`. That is the
intended read-only posture. Editing stays on `dosewiki-admin`; copying write
credentials to Effect Index would give a public marketing domain a production
write path.

The launched homepage has no construction-mode environment switch. The retained
`src/app/_components/ConstructionLanding.tsx` surface is available only at
`/under-construction` for historical inspection; it does not show a future
launch date.

The former `/preview` address space is compatibility-only:

- `/preview`, `/preview/`, and `/preview/home` permanently redirect to `/`.
- `/preview/<path>` permanently redirects to `/<path>` with its query preserved.
- Alias and legacy-search normalization run first, so old links reach the final
  canonical path without an extra redirect.
- Public-host editor links still hand off to `dev.dose.wiki`; credentialed editor
  APIs remain unavailable on the public origin.
- `/preview` stays in the robots disallow list while old crawlers age out.

Never write a new `/preview` href. Public and client routing use ordinary App
Paths.

### Caveat: middleware does not run under `next dev`

`next dev` compiles `middleware.ts` and writes it into the dev manifest, but
never invokes it: no security headers, host-specific editor handoff,
`/preview` compatibility redirect, or `/search/<q>` redirect. The same request
served by `next build && next start` — and by Vercel — runs all of it.
Host- or middleware-shaped work must therefore be verified against a production
server or deployment.

### dose.wiki project environment

The `dosewiki-admin` project leaves `NEXT_PUBLIC_SITE_FLAVOR` unset, which
selects the dose.wiki flavor. Its local, Development, Preview, and Production
Convex URLs must all resolve to `glad-minnow-656`; no environment mirrors or
substitutes a second Convex deployment. Launching Effect Index must not change
either rule.

### Domain arrangement

- `effectindex.com` is attached to the Effect Index Vercel project as its primary domain.
- `www.effectindex.com` is attached as a **redirect to the apex** `effectindex.com`.
- This is independent of the launched `dose.wiki` / `www.dose.wiki` hosts on `dosewiki-admin`.

### Analytics domain (`analytics.dose.wiki`)

- `analytics.dose.wiki` is a **307 redirect to a public PostHog shared dashboard**, served by its own minimal Vercel project (`ph-redirect`). It contains no application code.
- It is deliberately **not** attached to `dosewiki-admin`. Routing it through the application would serve the full public site at an unintended third hostname and blur the editor/public host policy.
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

Imports that bypass the editor do not invalidate Next caches automatically.
Revalidation intervals are demand-driven, not timers that regenerate every
article. After an import, perform an authorized targeted revalidation or
redeployment and verify the canonical public response. Do not treat elapsed
time or an editor-host response as proof of public freshness.

### Keeping substance articles warm across deploys

Vercel's ISR page cache does not survive a deployment, and this repo deploys
many times a day, so an article that is rendered on demand starts cold again
after every deploy. Two mechanisms keep readers off that cold path:

1. **Build-time prerender.** `src/app/[slug]/page.tsx` prerenders every
   substance whose `priority` is `high` or `normal`
   (`PRERENDERED_SUBSTANCE_PRIORITIES` in `lib/next/staticParams.ts`); the
   `low` tier, which the sitemap already omits, stays on demand with
   `dynamicParams = true`. The route declares a 3,600-second interval, but
   its 900-second data dependencies can shorten effective revalidation.
   The slug list uses the cached `getPublicSubstanceLookup` read rather than
   a corpus drain per worker. The worker budget remains documented in
   `next.config.ts`.
2. **Bounded cron warmer.** `vercel.json` schedules `/api/warm` hourly
   (`0 * * * *`). The default run selects at most 40 distinct, non-alias
   **high-priority** substance URLs. Normal and low-priority articles are
   excluded from scheduled warming. This uses existing editorial priority,
   not an inferred traffic ranking.

   Targets use `PUBLIC_SITE.url`: `https://dose.wiki` or
   `https://effectindex.com`, never the request host or an editor host.
   Concurrency remains 4 within the 45-second dispatch budget, with a
   20-second request timeout and one retry. The response reports planned
   targets, completed results, cache headers, failures, and remaining URLs.

   Query overrides: `concurrency=1..8`, `budgetMs=1000..50000`,
   `maxUrls=1..120` (default 40), and `rotate=0..1000000`.
   `includeLow=1` explicitly enables broader deployment-oriented warming:
   rotated low-priority targets first, then high/normal targets, still
   subject to `maxUrls`. The default offset advances 120 per hourly tick.
   Absence of `includeLow`, or `includeLow=0`, retains high-only selection.

   The route requires `CRON_SECRET` and its matching bearer token, with the
   existing rate-limit gate. No secret or provider setting is changed by
   this source edit. The daily `/open-data` crons are unchanged.
   Production log inspection on 2026-09-05 confirmed the previous
   15-minute warmer was receiving requests; its downstream completion counts
   and share of Convex I/O were not measured.

To warm from a workstation, or right after a deploy finishes, run the
observable CLI version against the public host:

```bash
npm run warm:public-routes -- --base-url https://dose.wiki            # substance articles
npm run warm:public-routes -- --base-url https://dose.wiki --all      # every sitemap URL
```

It walks `/sitemap.xml`, fetches each URL with `--concurrency` (default 4), a
per-request `--timeout` (default 20000 ms), one retry on a network error,
timeout, or 5xx, then prints the count, hits versus misses, the slowest ten
URLs, and the total time. It exits non-zero above `--max-failure-percent`
(default 10). Pointing it at `dev.dose.wiki` warms nothing: the editor hosts
publish an empty sitemap by design, and the script says so. There is no
Vercel post-deploy hook in use (`scripts/deploy/vercel-build.mjs` is the build
command only), which is why the scheduled route exists.

Routine warming must not use the whole-corpus CLI merely to conceal expensive
queries. A CDN miss is not proof of a database read. Compare warmer response
summaries with ISR regeneration, Data Cache behavior, and Convex function I/O.

### Public read-index rollout

The indexed readers and atomic maintenance are implemented in the checkout;
their release and data backfills are separate production operations. Follow
[Convex credentials](convex-credentials.md) and obtain explicit authorization
for the exact deployment and write batch.

1. Resolve the current checkout's release gates. Confirm that the public
   frontend supports the complete shared gallery-corpus fallback before
   activating the new backend readiness condition. If not, stage the
   fallback-aware frontend first without publishing Convex.
   **The normal production build publishes Convex before Next**, so a
   frontend-only stage must deliberately use the documented verification-only
   build mode rather than the normal write-capable wrapper.
2. Run `npm run convex:doctor` with
   `TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud`, and complete the
   strict deployment/function-drift gates before the authorized backend release.
   Do not publish an unrelated or unreviewed working tree.
3. Use the existing `scripts/convex/backfill-trip-report-substance-index.mjs`
   with `--index=history`, then `--index=gallery`, `--index=reviews`, and
   `--index=tripReports`. Run each with `--dry-run` first. It prints the exact
   operation confirmation and deployment fingerprint required for `--write`.
   Gallery/history/reviews additionally require
   `--confirm-public-read-index-backfill`; tripReports retains
   `--confirm-trip-report-substance-index-backfill`.
4. Use bounded batches, such as `--batch-size=25 --max-pages=100`, and resume
   from the server-owned checkpoint until every status reports
   `indexActive: true` for the current version. A nonempty relation or a
   successfully completed partial batch is not readiness. Never invent or
   advance a cursor manually.
5. Complete the authorized Next rollout for both projects, then verify public
   gallery membership/order, history, contributor credits, report matching,
   and edit/removal freshness on their canonical hosts. Backend readiness and
   cache key changes do not certify cross-host or cross-project invalidation.
6. Compare at least one complete UTC day of per-function calls, database bytes,
   cache behavior, and warmer activity against the dated baseline. Source
   improvements are not measured savings.

Before readiness, gallery reads use the existing shared paged corpus;
history, review, and report reads retain complete source fallbacks. Those
fallbacks are not service-limit-proof, so backfill history promptly and keep
the rollout window short. Direct dashboard edits or raw `convex import` bypass
application index maintenance and must not modify the indexed source tables.
See [Runtime and Data Architecture](../architecture/runtime-and-data.md#maintained-public-read-indexes).

### Post-deploy verification checklist

On `effectindex.com`:

- [ ] The homepage leads with the Subjective Effect Index and carries the Effect Index description.
- [ ] Primary navigation reads Effects, Replications, Substances, Trip Reports; About remains secondary and the homepage tile grid still omits Substances.
- [ ] The blog and all four supporting pages resolve: `/donate`, `/contact`, `/discord`, `/copyright-disclaimer`.
- [ ] A sample effect, substance, report, article and replication page each render.
- [ ] Page source shows Effect Index in the `<title>`, the Open Graph tags and the JSON-LD structured data.
- [ ] `/sitemap.xml` lists the Effect Index-only routes.
- [ ] `/sign-in` and the editor routes fail — confirm this, it is the expected read-only posture.

On `dose.wiki` / `www.dose.wiki`:

- [ ] `/` serves the real homepage; representative substance, effect, report,
  article, blog, and replication routes render without `/preview`.
- [ ] `/preview/home` and `/preview/substances?tab=common` return permanent
  redirects to `/` and `/substances?tab=common`.
- [ ] Canonical, Open Graph, structured-data, robots, and sitemap URLs use
  `https://dose.wiki`.
- [ ] `/dev`, `/review`, and `/sign-in` hand off to `dev.dose.wiki`; editor APIs
  remain unavailable on the public origin.
- [ ] Both appearance axes work: day/night and Fun/Pro.
- [ ] Effect Index-only routes return 404: `/donate`, `/contact`, `/discord`,
  `/copyright-disclaimer`, and `/documentation-style-guide`.

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
