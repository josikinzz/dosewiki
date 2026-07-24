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
- Remote analytics must remain limited to the exact public host allowlist. Admin and Vercel preview HTML must not execute `analytics.dose.wiki`.
- HTML responses must retain the path-split browser policy documented in [browser-security-policy.md](browser-security-policy.md): public documents use the static-compatible `script-src` (`'unsafe-inline'`, no nonce/hash) so ISR stays effective; `/dev` documents keep the strict nonce-plus-hash policy. Plain `'unsafe-eval'` remains forbidden everywhere.

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
