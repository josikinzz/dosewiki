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
