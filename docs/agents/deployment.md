# Deployment

This repo is linked to Vercel. Treat this file as the repo-local deployment/account routing source of truth.

## Vercel

- Account scope: `personal`
- Org ID: `team_mjd3LTYIDSudCGd7HeBhd04R`
- Project ID: `prj_XzisetSDrUgXiQO54FrHXdNNaHfO`
- Project name: `dosewiki-admin`

### Domain routing invariant

- `dosewiki-admin` is the full app/admin deployment.
- `dose.wiki` and `www.dose.wiki` must remain under-construction public hosts until the user explicitly asks to launch the public site.
- Do not alias a full app deployment to `dose.wiki` or `www.dose.wiki` during `/push`.
- If these domains are attached to this Vercel project, `middleware.ts` must keep the host gate that redirects non-homepage requests on `dose.wiki` / `www.dose.wiki` back to `/`.
- The construction-host gate may pass `/api/csp-report` for report-only security telemetry; this exception must not expose application data or editor APIs.
- Keep `NEXT_PUBLIC_SITE_URL` pointed at the crawlable full-app host (`https://dosewiki-admin.vercel.app` or the active admin preview URL) while the public hosts are gated. Switch it to `https://dose.wiki` only as part of an explicit public launch.
- `NEXT_PUBLIC_SITE_FLAVOR` picks the publication identity at build time: unset / unrecognised = dose.wiki, `effectindex` = Effect Index. The `dosewiki-admin` project must leave it unset. A typo silently falls back to dose.wiki, so the build logs a runtime-env warning when the variable is set to an unrecognised value.
- Remote analytics must remain limited to the exact public host allowlist. Admin and Vercel preview HTML must not execute `analytics.dose.wiki`.
- HTML responses must retain the path-split browser policy documented in [browser-security-policy.md](browser-security-policy.md): public documents use the static-compatible `script-src` (`'unsafe-inline'`, no nonce/hash) so ISR stays effective; `/dev` documents keep the strict nonce-plus-hash policy. Plain `'unsafe-eval'` remains forbidden everywhere.

## Effect Index (`effectindex.com`)

Effect Index is a **second Vercel project on the same repository and branch** as `dosewiki-admin`, built with the same install and build commands (`vercel.json`: `bun install --frozen-lockfile` / `bun run build`). Nothing about it is a fork — the only difference is its environment.

### Pre-deploy blocker: Convex working-tree drift

> **Read this before running `convex deploy --prod`.** The first acceptance criterion of the launch is deploying the new public queries to the production Convex deployment (`glad-minnow-656`). Convex deploys **the working tree**, not git HEAD.
>
> Two mutations exist in the working tree but **not in `HEAD`**, while being live in production:
>
> - `mergeUnknownTwin` — `convex/replications.ts`
> - `repairLegacyMedia` — `convex/subjectiveEffects.ts`
>
> Deploying from a clean checkout would **silently delete both from production**, and the deploy would still report success. Resolve this first: either commit them, or confirm they were throwaway tooling and are safe to drop. Verify before deploying with:
>
> ```bash
> git show HEAD:convex/replications.ts | grep -c mergeUnknownTwin
> git show HEAD:convex/subjectiveEffects.ts | grep -c repairLegacyMedia
> ```
>
> A `0` from either means the drift is unresolved.

### Environment variables the Effect Index project sets

| Variable | Value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_FLAVOR` | `effectindex` | Build-time publication identity. See `src/config/siteFlavor.ts`. Unset or unrecognised falls back to dose.wiki, so a typo here silently ships the wrong site. |
| `NEXT_PUBLIC_SITE_URL` | `https://effectindex.com` | Canonical origin for metadata, Open Graph, structured data and the sitemap. |
| `CONVEX_PUBLIC_READ_URL` | `https://glad-minnow-656.convex.cloud` | Server-side public reads, against **production** Convex. |
| `NEXT_PUBLIC_CONVEX_URL` | `https://glad-minnow-656.convex.cloud` | Browser Convex client, against **production** Convex. |

### Variables the Effect Index project deliberately omits

The omissions are the security posture, not an oversight. Leaving these unset makes the deployment **read-only**:

- `CONVEX_URL` — the privileged write target. `lib/convex/runtimeTargets.ts` selects the write deployment from `CONVEX_URL` first and never falls back to `CONVEX_PUBLIC_READ_URL`, so with `CONVEX_URL` unset there is no write target at all.
- `CONVEX_ADMIN_KEY` (and the `CONVEX_ADMIN_TOKEN_*` intent tokens) — without an admin key, `lib/convex/serverWriteCapability.ts` reports a configuration failure rather than a usable write client.
- `AUTH_SECRET` / `NEXTAUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_ADMIN_EMAILS` — no sign-in, no sessions, no admin membership.

**Consequence, and it is intended:** editor routes and `/sign-in` **fail on `effectindex.com`**. That is the designed behaviour of a read-only publication deployment, not a bug. Do not "fix" it by copying the write credentials across — doing so would give a public marketing domain a write path into the production database. Editing stays on `dosewiki-admin`.

`NEXT_PUBLIC_HOME_CONSTRUCTION_MODE` is **left unset** on the Effect Index project. Effect Index launches as a live public site, so it must not serve the holding page.

### dose.wiki project environment

**Unchanged.** The `dosewiki-admin` project keeps its existing variables exactly as they are, including `NEXT_PUBLIC_SITE_FLAVOR` left unset (which resolves to the dose.wiki flavor). Launching Effect Index must not touch it.

### Domain arrangement

- `effectindex.com` is attached to the Effect Index Vercel project as its primary domain.
- `www.effectindex.com` is attached as a **redirect to the apex** `effectindex.com`.
- This is independent of the `dose.wiki` / `www.dose.wiki` construction-host gate described above, which stays on `dosewiki-admin`.

### Caveat: content imports do not appear until a redeploy or revalidation

Public routes are prerendered (SSG) or incrementally revalidated. `PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS` in `lib/convex/publicData.cache.ts` is **900 seconds (15 minutes)**.

Importing content into Convex therefore does **not** immediately change the live site. A prerendered route keeps serving its build-time snapshot until either a redeploy regenerates it or the revalidation interval elapses. **This has already bitten this project once** — a completed import looked like a failed import because the pages had not regenerated. After any content import, either trigger a redeploy or wait out the interval before concluding anything is wrong.

### Post-deploy verification checklist

On `effectindex.com`:

- [ ] The homepage leads with the Subjective Effect Index and carries the Effect Index description.
- [ ] Primary navigation reads Effects, Replications, Reports, Substances, About.
- [ ] The blog resolves, and all four supporting pages resolve: `/donate`, `/contact`, `/discord`, `/copyright-disclaimer`.
- [ ] A sample effect, substance, report, article and replication page each render.
- [ ] Page source shows Effect Index in the `<title>`, the Open Graph tags and the JSON-LD structured data.
- [ ] `/sitemap.xml` lists the Effect Index-only routes.
- [ ] `/sign-in` and the editor routes fail — confirm this, it is the expected read-only posture.

On `dose.wiki` / `dosewiki-admin`:

- [ ] Appearance unchanged.
- [ ] The light/dark theme toggle still works (Effect Index pins light and hides the toggle; dose.wiki must not).
- [ ] The Effect Index-only routes 404: `/donate`, `/contact`, `/discord`, `/copyright-disclaimer`, and the blog.

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
