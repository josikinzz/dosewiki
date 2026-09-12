## 2026-09-12 Reader appearance menu, second pass (default face restored, Colour opens first)

All three surfaces serve commit `62046387` on
`integration/appearance-on-prod-line`, each uploaded from its own isolated
detached `git worktree` at that commit: dosewiki-public
`dosewiki-public-j4vuj0jhx`, dosewiki-admin `dosewiki-admin-ow9h6zs3j`,
effectindex `effectindex-4hfnrvvtb`. Roll back to `dosewiki-public-dmn8ypd14`,
`dosewiki-admin-illwbuytx`, and `effectindex-z21v1pylh` with the explicit
`--scope josies-projects-f217d517`.

Two operator corrections to the release earlier the same day.

The first restores the default reading face. The authored branch had made
Lexend the site default, which is the *absence* of `data-font`, so every reader
who had never touched the picker was moved onto it and the display scale and
tracking moved with them. The default is `"standard"` again: the absence of the
attribute now re-seats nothing, so a document with no choice wears exactly the
authored `base.css` pairing (the Inter body face, the Blinker display face, the
negative tracking ramp, the full display clamps) that shipped before the menu
existed. Lexend becomes an ordinary paintable face with its own
`data-font="lexend"` block carrying the tracking and display-size re-seats it
needs, and the picker gains a Standard entry ahead of the five faces.

Two consequences worth keeping. Lexend drops to `preload: false`, the Pro
face's terms, because it no longer paints on every page: a reader who never
chooses it fetches none of it, and the public document went from five font
preloads to four. And the retired binary toggle's stored `"dyslexic"` no longer
decays onto the default: `LEGACY_FONT_PREFERENCES` maps it to the Lexend face in
both the pre-paint bootstrap and the provider, and the provider *rewrites* the
key rather than removing it. Removing it was correct only while the default was
Lexend; against a Standard default it would have moved every reader who had
chosen the dyslexia-friendly face onto the standard one on their next visit.

The second correction opens the menu on the Colour tab, with Font one swap
behind the type glyph. `AppearanceControls.test.tsx` grew an `openCogOn` helper
so its cases name the tab they exercise instead of depending on which one opens
first; the keyboard-walk case now walks Colour, swaps, then walks Font.

The dose.wiki theme bootstrap hash moved with the default-face change to
`sha256-9gQoeeQFqs7RBA5n+VWUs1OsvwenesMr+i0CaieUyDo=`; the Effect Index script
stayed byte-identical. The tab reorder is React state and touches no bootstrap.
The zh-Hans catalog regained `Standard` (标准) and stands at 1,951 entries.

Gates: `tsc --noEmit` clean and 615 test files with 5,921 tests green. A loaded
run reported ten failures across `publicData.changelog`, `save-to-convex`,
`ArticleContextBridge`, `ArticleDraftFormFieldsRHF`, `MyReportsTab` and
`WritingTab`; all six files pass in isolation and the run that flagged them took
563s against the clean run's 234s, so they are load-induced flakes rather than
regressions. A local build with a missing `.env.local` fails at "collect page
data for /[slug]": the release worktrees need the file before `bun run build`.

Live checks: a reader with no stored face gets no `data-font`, body on
`bodyFont` and headings on `siteFont`, with four font preloads and no Lexend
fetch; a reader carrying the legacy `dyslexic` key lands on `data-font="lexend"`
with the key rewritten to `lexend` and survives a second visit; the menu opens
on Colour and the Font tab shows Standard parked at `-0.01 em`; and
`zh.dose.wiki` opens the same menu as 生动 / 深色 / 背景 / 强调色 / 重置颜色 with
标准 on the font tab.

## 2026-09-12 Reader appearance menu (font and colour controls under the header cog)

All three surfaces serve commit `9b734e8e` on
`integration/appearance-on-prod-line`, each uploaded from its own isolated
detached `git worktree` at that commit: dosewiki-public
`dosewiki-public-dmn8ypd14`, dosewiki-admin `dosewiki-admin-illwbuytx`,
effectindex `effectindex-z21v1pylh`. Roll back to `dosewiki-public-hs698hfwx`,
`dosewiki-admin-ei1yoya4s`, and `effectindex-iw9fhf1d7` with the explicit
`--scope josies-projects-f217d517`.

The release carries the reader appearance menu authored on
`Lyrea/appearance-menu` (10 commits, `f6c8c064` through `c3950e30`): a two-tab
popover under the existing header cog, with a five-face font dropdown (Lexend
default, Inter, Blinker, Titillium Web, System UI), Text size, Letter spacing
and Line height sliders on the Font tab, and Dark/Light plus the Background and
Accent rails on the Colour tab. The binary dyslexic toggle retires onto Lexend
and `font-type.css` replaces `dyslexic-type.css`. It also carries the four
`no-corpus-drain` commits the previous release predated (`3713c38a` through
`1aaf104a`, the replications and articles mirror plus CategoryGrid labels).

The author's branch forked at `f955725b` (2026-09-04), before the PlanetScale
cutover and the locale mirrors, so it was replayed onto the production line
rather than merged: merging drags the `main` / `no-corpus-drain` divergence in
for 130 conflicts, while cherry-picking the 10 appearance commits gives 9. Four
integration decisions are worth keeping:

- `AppearanceCog` and `FontPicker` were rewritten from a base that predated the
  2026-09-11 locale pass. The branch's structure was kept and `t()` re-applied;
  `discloseColorGroups` went away with `AppearanceAxes`, which the new
  `AppearancePanel` replaces in the reader menu.
- `ThemeLab.module.css` arrived with a bare `:global(body)` rule, which fails a
  production CSS-module compile (`not pure`). The rule already existed in the
  plain `theme-lab.css`; only the branch's `!important` (which holds the
  reserved gutter against Radix Select's scroll lock) moved there.
- `AppearancePanel` shipped with no catalog import, so the new reader menu would
  have rendered English on the mirror. Thirteen strings now resolve through
  `t()`/`msg()` and the zh-Hans catalog grew to 1,950 entries.
- The branch carried cp1252/UTF-8 mojibake in five files, reader-visible as
  `0Â°` in the hue read-outs, plus stray BOMs. Both are repaired; the same files
  are clean on `no-corpus-drain`, so the damage was the author's editor.

Generated artifacts were regenerated on the merged tree rather than taken from
either side: `iconData.generated.json`, the appearance palette/chroma/sheet
JSON, and the dose.wiki theme bootstrap CSP hash
(`sha256-e9qVua8Jsun1jR1ddFS9AI1KSILW+ZMZF2LAKNbex6Q=`; the Effect Index script
stayed byte-identical). That hash only reaches `/dev` documents, because public
documents keep the hash-free static `script-src`.

No Convex functions were published: the public and Effect Index projects hold no
deploy key and the editor build ran with `--build-env CONVEX_DEPLOY_KEY=`.

Gates on the release commit: `tsc --noEmit` clean, 615 test files and 5,921
tests, `provenance:check` with 55 tracked exports and no issues, and a local
`next build --webpack` reporting zero editorial browser modules and zero browser
Convex clients on the public artifact.

Live checks: the cog opens both tabs on `dose.wiki` and `www.dose.wiki`, the
hue read-outs render `0°` rather than `0Â°`, selecting Titillium Web sets
`data-font="titillium"`, `zh.dose.wiki` serves the panel as 外观设置 / 文字大小 /
字间距 / 行高 / 恢复默认设置 with `noindex` and an English canonical,
`effectindex.com/effects` renders with zero CJK chrome, `effectindex.com/donate`
200s while `dose.wiki/donate` 404s, `/preview/home` still 308s to `/`, and
anonymous `dev.dose.wiki/dev` 307s to `/sign-in`.

Two mirror defects survive this release and are not regressions from it. The
catalog is flat and keyed by English source text, so the scheme toggle's `Light`
resolves to 轻度, the dose-intensity sense seeded by
`dosageDurationLabels.ts`; `ThemeToggle` already had this. And the colour rails'
`Hue` and `Saturation` sub-labels are composed as `` `${name} hue` ``, so they
never become catalog keys and stay English. Fixing either means giving the
catalog a disambiguation mechanism.

## 2026-09-11 zh.dose.wiki crash fix, About, class definitions, library archive

All three surfaces serve commit `17e2257e` on `no-corpus-drain`: dosewiki-public
`dosewiki-public-f8urlcnih`, dosewiki-admin `dosewiki-admin-mwp4u0eoo`,
effectindex `effectindex-bbojfl4kw`.

Incident: after the chrome pass every zh.dose.wiki article, effect, and report
answered 500 (`FUNCTION_INVOCATION_FAILED`, "Page changed from static to
dynamic at runtime, reason: headers"). The root `not-found.tsx` had started
reading `headers()` to pick the 404 language; Next renders that boundary
inside every static route's tree, so the call flipped each ISR mirror page
dynamic at request time. Rule: the root not-found boundary must never touch
request APIs. The mirror 404 is now a real page (`/zh/unroutable/missing`)
that the middleware rewrites to with `status: 404` for mirror-host paths
outside the public corpus; a nested `/zh/not-found.tsx` boundary was tried
and rejected because Next only renders nested boundaries on the client (the
server ships an empty error shell).

Coverage: the About page translates its live editor-managed prose (the
catalog seeds the live document with `splitAboutMarkdown`, the page's own
splitter, under `--live-copy`), the substance index class definitions and
warnings are catalog-seeded, the library archive mirrors at `/zh/articles`
and `/zh/articles/<slug>` as the fourth translation kind (`library`; batch
import of 774 segments, cron dispatch, publish hook on the writing-article
save path), and the articles index chrome renders through `t()`. Store
state after the release: 28,097 segments, 0 due jobs.

Cron note: the 399 effect and report refresh jobs enqueued at the previous
release had never run (Vercel had not invoked the schedule); one manual
authorized GET processed all of them, every segment already stored. Verify
the schedule fires on the admin project; until then trigger it by hand after
bulk enqueues.

Editor build memory: `NODE_OPTIONS=--max-old-space-size=6144` OOM'd once more
(exit 137) at this route count; `4608` built. The project env now carries
`4608`.

## 2026-09-11 zh.dose.wiki chrome pass (About page, effect index panels, reports, dates, 404)

All three surfaces serve commit `17ab9680` on `no-corpus-drain`, uploaded from
isolated detached `git worktree`s at that commit: dosewiki-public
`dosewiki-public-gnl90q12f`, dosewiki-admin `dosewiki-admin-gp16dagi8`,
effectindex `effectindex-dd1b0dnyx`.

A four-agent crawl of zh.dose.wiki inventoried every reader-visible English
string on the localized surfaces; this release wires the results through the
UI catalog: `/about` joins the mirror (per-section translation of the
aboutMarkdown, Copy Studio blocks through `t()`, component literals), the
subjective effect index localizes its tab/category/subcategory panel titles
and a11y templates, effect articles and reports localize their chrome
(TOC labels, explorer controls, dossier/timeline/hero/back-link strings), the
404 body renders in the mirror locale via an `x-dosewiki-mirror-locale`
request header the middleware stamps ahead of the early 404 rewrites, and
dates render locale-aware (`Intl` for zh-Hans; English stays byte-pinned).
The zh-Hans catalog grew to 1,586 entries; the only uncovered scanned key is
the CC BY-NC-SA license identifier, which stays English by design.

Operational note: a batch of `vercel deploy` runs failed with
`No Next.js version detected` because the release worktrees for
`dosewiki-admin` and `effectindex` had not actually been checked out (the
pre-created directories made `git worktree add` fail silently behind a
`>/dev/null`). The CLI then uploaded an empty tree and the remote build had no
`package.json`. Verify a worktree contains `package.json` before uploading
from it.

Live checks: `zh.dose.wiki/about`, `/effects`, `/reports`, and the 404 body
render Chinese with `noindex` and an English canonical; English hosts and
effectindex.com render unchanged.

## 2026-09-11 zh.dose.wiki locale mirrors (substances, homepage, indexes, effects, reports)

All three surfaces serve commit `1e7d30dd` on `no-corpus-drain`, each uploaded
from an isolated detached `git worktree` at that commit: dose.wiki and
www.dose.wiki `dosewiki-public-2mcm9hu4g`, dev.dose.wiki
`dosewiki-admin-obc99u2zo`, effectindex.com `effectindex-8gc3h8hfx`.

The release ships the zh.dose.wiki locale mirrors (commits `dd7193bc` through
`1e7d30dd`): substance articles, the homepage, the substance index, the
subjective effect index and effect articles, and the trip reports index and
report pages all localize through the Postgres `translationSegments` store and
the `src/i18n` UI catalog. The mirror host is unlisted (`noindex`, canonical
back to the English page on every surface). The `translation-refresh` Vercel
cron on `dosewiki-admin` dispatches on the job slug prefix (`effect/`,
`report/`) and the store carries the imported zh-Hans batch segments for all
three corpora (27,352 rows) with 399 effect/report jobs enqueued at release.

Two defects found live during this release:

- The editor build (`DOSEWIKI_BUILD_SURFACE=editor`) was killed three times on
  the Vercel runner (`exit 137`, no error output after "Creating an optimized
  production build"); the same commit builds cleanly locally. Fix: the
  `dosewiki-admin` project now carries `NODE_OPTIONS=--max-old-space-size=6144`
  as a build environment variable, capping the V8 heap so webpack compiles
  inside the 8 GB runner instead of being OOM-killed. Keep it on future editor
  releases; the public and Effect Index builds never needed it.
- Uploads to `api.vercel.com` failed persistently with TLS `bad record mac`
  (server-sent alert 20) and mid-upload connection resets at the CLI's default
  50-way upload concurrency on this network path. The homebrew Vercel CLI's
  upload semaphore was patched locally from 50 to 2 and the SSL-alert/EPIPE
  failures made retryable (`/opt/homebrew/lib/node_modules/vercel/dist/chunks/
  chunk-BFAZVUS3.js`, backup at `/tmp/chunk-BFAZVUS3.js.bak`); a homebrew
  upgrade restores the stock behavior.

Migration `0006_translation_segments` was applied to production before the
first release (two empty tables; `drizzle-kit migrate` over
`POSTGRES_DIRECT_URL`). Live checks: `zh.dose.wiki/`, `/substances`,
`/effects`, `/effects/colour-enhancement`, `/reports`,
`/reports/exactly-as-advertised`, and `/2c-b` all 200 with localized content,
`noindex`, and an English canonical; `/zh/*` paths 404 on non-mirror hosts;
English hosts and effectindex.com render unchanged (zero CJK in chrome); the
translation-refresh cron answers 401 without `CRON_SECRET`.

## 2026-09-10 PlanetScale cutover (reads and writes on Postgres)

All three surfaces serve commit `54e47598` on `no-corpus-drain` with
`DATA_BACKEND=postgres` and `POSTGRES_POOLED_URL` set: dose.wiki and
www.dose.wiki `dpl_BzxZ3RKkZ3Jbx3rt6DQCGzLxYs4f` (`dosewiki-public-8lisyani1`),
dev.dose.wiki `dosewiki-admin-phumi1b1i`, effectindex.com `effectindex-bzbcuv90s`.
Convex `glad-minnow-656` is no longer runtime truth; it stays deployed through
the ticket 24 observation window (earliest 2026-09-17) with
`MAILING_LIST_FORWARD_URL=https://dose.wiki/api/subscribe` so any signup that
still reaches its `/subscribe` action is relayed to Postgres. The effectindex
project carries the same variable because that deployment is credential-free
and relays its signups to dosewiki.

The cutover sequence, evidence, timings and the two defects found live (the
mailing-list route bypassing the freeze; Effect Index answering 503 on the
Postgres backend) are recorded against ticket 23 in
[decisions.md](../../notes-and-plans/plans/convex-to-planetscale/decisions.md).
The PlanetScale branch `pre-cutover-2026-09-10` holds the pre-import state and
the cutover snapshot lives at
`runs/postgres-import/cutover-2026-09-10/prod-snapshot-cutover.zip` (gitignored).

Rollback is no longer an environment flip: reopened writes exist only on
Postgres, so going back means the reverse importer procedure in
release-manifest.md section 10 (freeze, `npm run postgres:reverse-export`,
`npx convex import --replace`, then `DATA_BACKEND` back to Convex and a
redeploy). The last Convex-serving production deployments, for the record:
public `dpl_7S5he3nSFR81UdHZCdQU6BMK8VYF`, admin `dosewiki-admin-keiiamrw8`,
effectindex `effectindex-6u2ow4zyk` (all built with `DATA_WRITES_FROZEN=1`).

## 2026-09-10 PlanetScale migration code release (still on Convex)

All three surfaces serve commit `b152320a` on `no-corpus-drain`, uploaded from a
detached `git worktree` at that commit, with `DATA_BACKEND` unset so every read
and write still goes to `prod:glad-minnow-656`. This release ships the code of
the Convex to PlanetScale migration ahead of the data cutover (plan:
`notes-and-plans/plans/convex-to-planetscale/release-manifest.md`, cutover
section 6), so the cutover itself is an environment change, not a build.

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_99PsGWrrG5DYajHpiuG5eMtRh92n` | `dpl_6X2yX16uDSsv9KjnrUJDwsjJSsHt` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_3PnorC5HCZJF8FknekN8jFNXXvkD` | `dpl_9AaCiwWPB9ZqLJStzzgS649sLsTN` |
| effectindex.com | `dpl_3FQAhrp6pP4LHs86UvVFUGpwpNhF` | `dpl_HfPndg7864cBJAcQqgY4CmeN2oaR` |

What changed for a visitor on this backend: nothing intended. The editor
surfaces read through `/api/editor/*` route handlers (TanStack Query, refetch
on focus, 15 s list interval) instead of browser Convex subscriptions, so the
bundle carries no `convex/react`. The mailing-list form posts to the
same-origin `/api/subscribe`, which forwards to the Convex HTTP action until
`DATA_BACKEND=postgres`; `https://dose.wiki/subscribe` rewrites to it for the
sibling sites (`mindstate-site` is repointed in its own repository). The
publication-delivery cron is a Vercel cron at `/api/cron/publication-delivery`
behind `CRON_SECRET`: it answers 401 without the bearer on `dosewiki-admin` and
503 on Effect Index, which has no secret and must not deliver.

A first upload of `cd655b03` failed on all three projects: `src/loadTranslations.ts`
imported `public/_gt`, which is gitignored, so the in-flight `gt-next` wiring
built locally and nowhere else. `b152320a` withholds that wiring (deps and
`gt.config.json` stay). Gates on the release commit: 614 app test files,
132 workflow test files, three typechecks clean, `postgres:rehearse-release`
78 checks with `Blockers: none`, and a clean-checkout `next build` (605 pages).
Live checks after aliasing: `/2c-b`, `/replications`, `/api/v1/substances`,
`/effects` on Effect Index all 200; `/api/subscribe` 400 on an invalid email
from an allowed origin; the sibling rewrite 400 from `mindstate.design`.

Postgres-side variables were staged on all three projects in the same session
(`REPLICATION_MEDIA_BASE_URL`, `POSTGRES_POOLED_URL`, and on `dosewiki-admin`
the write and intent-token tier mirrored from `npx convex env list`). They are
inert until `DATA_BACKEND=postgres` is set.

## 2026-09-09 How page review-status prose release

Public DoseWiki serves `dpl_xYifqQTuUbqVhyGrgnNWMDQxAFg1` on `dose.wiki` and
`www.dose.wiki`, built from commit `1c20a6ed` on `no-corpus-drain` in a detached
`git worktree` at HEAD outside the repository. The shared tree carries
uncommitted `gt-next`/translation scaffolding, About copy-block editor work, and
`scripts/feedback` work; none of it was uploaded. The release is one file,
`src/app/docs/how/page.tsx`, plus the two branch commits the previous public
build predated (`4084e3a0` docs record, `f5392212` range-less media GET fix).

The prose change: the header paragraph now leads with the completed Phase 3
entailment audit and the `citation needed` outcome before naming the two human
passes, instead of stacking three negative-status clauses that read as "nothing
was checked". Section 07 drops the duplicated `Step 3` sentence and states that
editorial review and citation status are recorded separately in each review
tool. Register follows the stored formal voice card in `.unslop/voice/josie`:
semicolons and colons removed to match the measured punctuation profile, vague
evaluation (`less far along`, `shows where it stands`) replaced with the named
mechanism. `voice_score` composite moved from 0.041 to -0.336 and GI from 0.50
to 0.656; the unslop removal gates report zero hard and zero soft hits with
preservation 3/3.

No Convex functions were published: `dosewiki-public` has no
`CONVEX_DEPLOY_KEY`, so the build logged checkout-only call-site integrity and
read no live function list. The editor hosts and Effect Index were not released.
`effectindex.com/docs/how` therefore still serves its older intro wording, which
is a known divergence, not a failed release.

Gates in the isolated worktree: `tsc --noEmit` clean, then 26 test files and 261
tests across `src/app/docs`, `src/data/content`, and `lib/next`. The
`lib/next/effectIndexRedirects.test.ts` failure seen in the shared tree does not
reproduce at this commit; it comes from the uncommitted `next.config.ts`
`withGTConfig` work. The remote build passed TypeScript and generated 596 pages.

Live checks: both public hosts serve the three rewritten passages and zero
matches for the removed wording. Roll back to
`dpl_35Eg2EUxBmxPqXLeg4qQbvCLaWC7` with `--scope josies-projects-f217d517`.
Evidence: `runs/how-page-release/2026-09-09-josie-voice-pass.json`.

## 2026-09-09 docs/code and About corrections release

All three surfaces serve commit `2949c413` on `no-corpus-drain`, each uploaded
from its own isolated detached `git worktree` at that commit, so the concurrent
About copy-block editor work and `scripts/feedback` work in the shared tree
stayed out.

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_35Eg2EUxBmxPqXLeg4qQbvCLaWC7` | `dpl_8FuAu9KYKZQag775Quzr7eGYce5W` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_9AaCiwWPB9ZqLJStzzgS649sLsTN` | `dpl_4utomjXBHiCMV3wfLfMpseDBaaBd` |
| effectindex.com | `dpl_kga2GcvRX1ZmmETTaPEb84oLja1w` | `dpl_ABn3dPyrG4zcTWpwRBoFdLgRXEhG` |

The release carries two things. The first is the `/docs/code` and About
corrections: the repository tree, reading order, and diagram node now name
`src/middleware.ts`, the page standardises on `next-auth` for the v4 dependency
instead of alternating with Auth.js, it states that Convex never sees per-reader
traffic, and it points at `scripts/chemistry/verify-openchemlib-fork.mjs`. The
About copy now says citations are checked for each **cited** claim and that
review state is tracked in the **Article Status** section, matching
`ContributorsSection.tsx` and `REVIEW_STATUS_BANNER_FALLBACK`; that prose was
already live through Convex `siteConfig` from 08:50Z, and this release brings
the `aboutContent.md` fallback in line.

The second is the branch itself. The preceding How page release built from
snapshot `65e4f167f9dca88afa9fb7b0397c0e604c828f6b` plus two overlay files, and
that snapshot forks from the branch at `f955725b` (2026-09-04). The public build
was therefore 17 branch commits behind: `dose.wiki` was serving the
pre-`d6751e4e` gallery, three columns wide on a phone, while Convex already
carried the 2026-09-09 replication projections. A served chunk on the new
deployment carries `columns-2 gap-1.5 sm:columns-3` and no longer the old
layout. Prefer a branch commit over a snapshot overlay unless the tree cannot be
made clean; a detached worktree at HEAD makes that unnecessary.

No Convex functions were published. All three builds logged `Convex functions
will NOT be deployed by this build`, the editor build through `--build-env
CONVEX_DEPLOY_KEY=` and the two public projects through their absent key.
`npm run convex:doctor` reported 351 checkout functions against 351 live on
`glad-minnow-656` with no drift before the release. Both public artifact audits
report zero editorial browser modules and zero browser Convex clients; the
editor audit reports 298 and 10.

Local gates ran in the isolated worktree: `tsc --noEmit` clean, then 36 test
files and 531 tests across `src/app/docs`, `src/data/content`,
`src/features/replications`, `src/features/effects/gallery`, and
`lib/next/copyBlocks.test.ts`.

Live checks: `/docs/code` on `dose.wiki`, `www.dose.wiki`, and
`effectindex.com` serves all four corrections; `dose.wiki/about` serves the
corrected sentences with no stale wording; anonymous `dev.dose.wiki/dev` still
307s to `/sign-in` with `noindex, nofollow, noarchive`; `POST
/api/dev/revalidate-article` without a token still returns 401;
`effectindex.com/reports` and `/effects` render. Evidence:
`runs/docs-code-release/2026-09-09-docs-code-and-about-corrections.json`.

The first public upload failed with the known `SSL alert number 20` (`bad record
mac`) against `api.vercel.com` and succeeded on retry with unchanged source.
A `vercel link --yes` typo created an empty project named `dosewiki-effectindex`
with no deployments; it was removed immediately. Effect Index remains
`prj_ipLwrIeglsQb6obFIZAS1D9YJqXc`.

## 2026-09-09 How page editor-prose release

Public DoseWiki serves `dpl_8FuAu9KYKZQag775Quzr7eGYce5W` on `dose.wiki` and
`www.dose.wiki`. Its isolated source uses snapshot
`65e4f167f9dca88afa9fb7b0397c0e604c828f6b` plus two files:
`src/app/docs/how/page.tsx` (the editor-prose integration from three Josie
drafts, commits `37689e12` and `6f5e5ac7`) and
`src/data/content/aboutContent.md` (the About copy rewrite already live via
Convex, commit `7dd7845f`). TypeScript, the full public static generation
(1,188 pages), and live phrase checks on both public hosts passed. Convex
deployment was skipped; the editor hosts and Effect Index were not released.
Roll back to `dpl_6Bsn1JMaYttuYhJ62TrER1yWdM9L` using the explicit scope
above. Evidence: `runs/how-page-release/2026-09-09-editor-prose.json`.

# Deployment

This repo is linked to Vercel. Treat this file as the repo-local deployment/account routing source of truth.

## Vercel

- Account scope: `personal`
- Org ID: `team_mjd3LTYIDSudCGd7HeBhd04R`
- Project ID: `prj_XzisetSDrUgXiQO54FrHXdNNaHfO`
- Project name: `dosewiki-admin`

### Public and editor topology

The public/editor cutover completed on 2026-09-06. `dosewiki-public`
(`prj_DLJxURx979YOVoBudXirAnkQUWSU`) owns `dose.wiki` and `www.dose.wiki`.
`dosewiki-admin` owns `dev.dose.wiki` and `dosewiki-admin.vercel.app`.
Never assign an editor artifact to either public domain.
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

### Application-authenticated editor delivery

The operator relaxed strict browser-code secrecy on 2026-09-06. Downloaded
JavaScript is not a secret or an authorization boundary. Existing dose.wiki
accounts protect editor documents and private data; server and Convex checks
enforce roles, ownership, and mutation permissions. Contributors do not need a
second Vercel account or a shared deployment password.

| Build | Environment | Output | Delivery |
| --- | --- | --- | --- |
| Public | `DOSEWIKI_BUILD_SURFACE=public` (production default) | `.next` | Public reading and editor handoffs; editorial browser modules excluded |
| Editor | `DOSEWIKI_BUILD_SURFACE=editor` | `.next-editor` | Exact editor hosts; application-account authentication for documents, RSC, and APIs |

Use `bun run build`, which invokes `next build --webpack`. Direct production
Turbopack builds are refused: the webpack module audit is a required part of this
delivery contract, not an optional size report. `NEXT_PUBLIC_EDITOR_BUILD` is
derived by Next configuration; do not set it independently. Source maps are not
published. Each output contains `editor-artifact-audit.json`, with emitted asset
hashes, sizes, replaced entry modules, and editor module/chunk identities. A
public compilation fails if a protected client module remains reachable.
`*.editor.tsx` entries compile to their `*.public.tsx` sibling, or a null default
component when no sibling exists; wrappers must supply a public children
passthrough. Dev/review page entries and legacy inline article editor primitives
are also replaced before dependency discovery. This is artifact separation, not
dead-code elimination based on the requesting host.

Known editor hosts are `dev.dose.wiki` and `dosewiki-admin.vercel.app`.
Additional deployment and branch aliases must be enumerated in
`DOSEWIKI_EDITOR_ALLOWED_HOSTS` as comma-separated exact hostnames, never
wildcards. Unlisted hosts fail closed with 503. Public publication hosts are
always refused by editor artifacts, even if mistakenly allowlisted. Public
artifacts refuse known editor hosts.

Static browser assets and the explicit sign-in, invitation, and password-reset
bootstrap routes are anonymously reachable on allowed editor hosts. Bootstrap
handlers still validate credentials, invitation/reset tokens, and rate limits.
An asset-looking suffix on a dynamic route does not bypass authentication.
Editor documents and RSC require a contributor-or-higher application session.
APIs and Convex independently enforce their own role and ownership requirements.
The exact `POST /api/dev/revalidate-article` is a headless exception to the
middleware session gate on allowed editor hosts. Its route handler still
requires the `citationEvidenceWrite` admin token and enforces rate and body
limits. Missing or invalid tokens fail with 401. Other methods and editor API
paths retain session authentication; public and unlisted host restrictions
still apply.
Editor responses carry private/no-store browser and CDN directives and noindex.
No provider-protection acknowledgment is required or accepted.

#### Release sequence

1. Create `dosewiki-public` with the public surface and only required public
   runtime configuration. Do not copy editorial auth, admin, or deployment keys.
   Do not reuse the retired `dosewiki` project. Effect Index remains independent.
   Public report and feedback intake receives only
   `CONVEX_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE`, matched on Convex. This token
   cannot read private queues or modify published content.
2. Build and audit both application artifacts without deploying Convex. For an
   editor application-only stage, override the build's `CONVEX_DEPLOY_KEY` with
   an empty value. Keep the real project key configured for the backend stage.
   The editor project's Vercel Output Directory must be `.next-editor`, matching
   Next's `distDir`; the public project uses the default `.next`.
3. Assign the ready editor application to `dev.dose.wiki` and the editor default
   aliases without moving the public domains. Keep existing provider protection
   on non-custom URLs as defense in depth. Contributors use the custom domain
   and their existing application accounts.
4. Run the Convex credential and strict drift checks, deploy the same backend
   source, and complete the bounded proposal-target backfill. The old public
   server's trusted intake credential remains accepted during this cutover.
5. Move `dose.wiki` and `www.dose.wiki` to the ready public artifact only after
   scoped intake is live. Promote the final editor deployment after public
   domains are detached. Never attach public hosts to an editor artifact.
6. Verify public reading/intake validation, anonymous editor redirects and
   RSC/API denials, sign-in bootstrap, and role/ownership behavior. Keep
   credentials out of client configuration, build logs, and public artifacts.

No paid plan changes, account invitations, historical deployment deletion, or
provider protection changes are implied by this sequence. Previously delivered
browser code cannot be recalled. Historical code secrecy is not a release gate.

#### Release evidence and rollback

Keep evidence outside public assets. Prepare a JSON inventory with
`hosts: [{origin, kind}]`, where kind is `custom`, `default`, `preview`, or
`public`. Include current editor aliases and both public flavors. Optional
`challengeOrigins` lists independently identified provider login origins. Run:

```bash
node scripts/deploy/verify-editor-delivery.mjs \
  .next-editor/editor-artifact-audit.json /path/to/host-inventory.json
```

The probe sends no credentials. Editor chunks may be accessible; protected
documents and data must be denied or redirect to sign-in. Public builds must
not serve the emitted editor chunks. A 503 is safe closure, not a healthy
release. The probe does not prove signed-in roles or ownership: separately
exercise application permissions and account-bound draft recovery.

The 2026-09-06 release serves editor deployment
`dpl_J4N9Aw9HfT6ANs45ZHZDRvTyg6bt`, public DoseWiki deployment
`dpl_HGg7F8ebr6Za25vd5sDYcV7mKKmT`, and Effect Index deployment
`dpl_4u5w1zbtp6vXs9JqigRJWHpgStaC`. All three passed the emitted-artifact
audit and live server-rendering checks. Both public artifacts contain zero
editorial browser modules. Next's externalized router contexts require their
complete traced runtime dependency closure, including React's JSX runtime;
the isolated packaging regression exercises an actual server render.

Backend release snapshot `e6c67903fd18ed49518079a7c0a663a2740abdd4`
was deployed through the committed-source and explicit-deletion gates.
The live inventory matched all 347 checkout functions. The proposal-target
backfill completed in two bounded pages without rewriting proposal contents.
The snapshot preserves the working branch and index and includes matching
caller, schema, and deployment-tooling inputs.

Live checks covered public reading, editor sign-in rendering, anonymous
document/RSC redirects, private API denials, and malformed intake rejection.
Authenticated production editing remains unverified in this release record:
the browser relay could not attach to an existing signed-in account.

The later 2026-09-06 editor-only revalidation repair serves
`dpl_JED2iemn7QMWWr8L4P3eZp6StZYW`. Its 5,314 uploaded source files were checked
against the preceding editor deployment; only `src/middleware.ts` differs.
The build explicitly skipped Convex deployment. Live checks rejected missing
and invalid tokens, retained the GET and sibling-API session gates, and accepted
the authorized clonidine refresh. Evidence is retained under
`runs/section-generation/cite-pi/isolated-editor-deployment-completion.json`.
This verifies headless revalidation, not signed-in editing.

The subsequent 2026-09-06 worktree release uses source snapshot
`65e4f167f9dca88afa9fb7b0397c0e604c828f6b`, without changing the working branch
or index. Public DoseWiki serves `dpl_AyjubGnVuhja9P5Tq8c4SH6ysz4q`, the editor
serves `dpl_BgcFZu3SpWUesk1cGiGHyz3ygQzM`, and Effect Index serves
`dpl_8xriWNfJdK4V6iEPEUxVoksKYJEh`. Both public artifact audits report zero
editorial browser modules; the editor audit reports 298. All three explicitly
skipped Convex deployment because the strict live inventory already matched
all 347 checkout functions.

This release includes the 26 embedded-editor improvements and the reviewed
public gallery, viewer, article, effect, and editor workbench changes. It also
removes contributor-directory serialization from public effect-page Flight
responses and fixes the viewer's collection-regroup transition. The latter
regression failed before the fix and passed afterward. The app suite passed
602 files; final viewer/effect checks passed 341 tests with typecheck and lint.
Workflow tests, script/backend typechecks, and provenance passed. The aggregate
workflow command remains non-green solely on 28 cleanup/file-size budgets;
no budget thresholds were raised for the release.

Live checks verified all seven canonical/default host mappings, public
HTML and Flight responses, replication API reads, sign-in rendering, anonymous
editor document redirects, and private editor API rejection. Effect-page
HTML and Flight no longer contain the contributor directory. Production
authenticated editing was not exercised; local actual-component fixtures
verified the editor interactions without publishing. Local run/recovery data
and credentials were excluded from the source upload.
The live replication embed opened its viewer and advanced to the next work.
Video playback could not be verified from the verification client: the media
worker returned Cloudflare 403 error code 1010. No provider checks were changed
or bypassed.

Rollback targets for this application-only release are public
`dpl_6wTcvYvLczJMQ3inuiduHeTqiKhs`, editor
`dpl_JED2iemn7QMWWr8L4P3eZp6StZYW`, and Effect Index
`dpl_3eesiuWujTLppFu1KMhedcuF7cfn`. Use the explicit
`--scope josies-projects-f217d517` when promoting or rolling back these projects.

The replication-index social-card release serves
`dpl_JCrDSTrUVcbXuHLiKCLRY64HjeCh` on both public DoseWiki hosts. Its 4,994
source files match `dpl_AyjubGnVuhja9P5Tq8c4SH6ysz4q` except for
`src/data/pageSocialCardManifest.generated.json`; only the replication card URL
changed. The approved card adds compact gallery counts above the artwork.
R2 publication passed immutable-object digest verification, and live
`/replications` HTML on both hosts advertises the new Open Graph and Twitter
image with the unchanged canonical URL. Convex deployment was skipped; editor
and Effect Index deployments were not changed. Evidence is retained under
`runs/replication-stats-social-card/`. The public rollback target is
`dpl_AyjubGnVuhja9P5Tq8c4SH6ysz4q`.

The 2026-09-07 Osmanthus integration repair serves
`dpl_7G72TVSBmQeDNj5TvypXVZaWi9so` on `dose.wiki` and `www.dose.wiki`.
Its 4,994 source files match `dpl_JCrDSTrUVcbXuHLiKCLRY64HjeCh` except for
`lib/next/replicationEmbedPolicy.ts`. The operator explicitly approved
`http://localhost:3000` and `http://127.0.0.1:3000` as additional exact parents
of the public replication document. Other ports remain development-only;
LAN addresses and arbitrary preview domains remain untrusted.
The production build passed TypeScript and the public artifact audit with zero
editorial browser modules, and 112 policy/middleware tests passed locally.
Convex deployment was skipped; the editor and Effect Index were not released.
Live Osmanthus verification covered the publisher handshake, visible showcase,
viewer navigation, and same-frame workspace restoration. Osmanthus separately
replaced its loading iframe's hidden visibility with opacity to avoid a
Chromium startup deadlock. Roll back this publisher release to
`dpl_JCrDSTrUVcbXuHLiKCLRY64HjeCh` with the explicit scope above.

The compact substance-editor controls release serves
`dpl_De5DhA9BeaGdMaMg6UF8vfcEjXnc` on `dev.dose.wiki` and
`dosewiki-admin.vercel.app`. Its isolated source uses snapshot
`65e4f167f9dca88afa9fb7b0397c0e604c828f6b` plus the four article layout,
session toolbar, section-trigger, and warning-trigger files. The build explicitly
skipped Convex deployment and passed the editor artifact audit with 298 editorial
browser modules. Public deployments were not changed.

Live probes confirmed editor document and RSC sign-in redirects, private API
401 responses, sign-in rendering, and noindex/private-cache headers. Public
`/2c-b` remained readable. Desktop/mobile editing interactions were verified
locally; authenticated production editing was not exercised. The pre-release
suite passed 602 test files and TypeScript. Roll back this controls release to
`dpl_BgcFZu3SpWUesk1cGiGHyz3ygQzM` using the explicit scope above.

The expanded editor-compaction release serves
`dpl_HDqYPrHQUbysredBdoqpuw7Hgquj` on both editor hosts. Its isolated source
uses the same snapshot plus 14 scoped UI files, retaining the substance controls
and adding the icon-only launcher, effect heading actions, compact form-row
removal, proposal/history rows, and section action toolbar. Compilation,
production TypeScript, all 1,185 static pages, and the 298-module editor artifact
audit passed. Convex deployment was explicitly skipped.

The first attempt stopped during static generation because Convex had disabled
production at its spending limit. After the operator restored availability,
the unchanged source deployed successfully. No billing settings were changed by
the release. Public DoseWiki and Effect Index deployment IDs remained unchanged.
Live checks passed for article/effect document and RSC sign-in redirects,
article/effect API 401s, sign-in rendering, private/noindex headers, and public
reading. Local verification passed 83 affected tests, TypeScript, and
desktop/mobile interaction checks; proposal/history samples stayed browser-only.
Authenticated production editing was not exercised. Roll back to
`dpl_De5DhA9BeaGdMaMg6UF8vfcEjXnc` using the explicit scope above.

The citation-disclosure editor release serves
`dpl_ATw2BKyuFY261dQiXRB1mnMYQ8zm` on both editor hosts. It retains the
expanded compaction release and collapses supporting references in every
substance section popup, except the dedicated References editor, plus citations
in the effect popup. Counts remain visible and citation validation stays
reachable. Its isolated source uses the same snapshot plus 15 scoped UI files.
Production compilation, TypeScript, 1,185 static pages, and the 298-module
editor artifact audit passed. Convex deployment was explicitly skipped.
Live document/RSC redirects, private API 401s, sign-in rendering, and
private/noindex headers passed. Public DoseWiki and Effect Index deployment IDs
remained unchanged. Local checks covered the 225-reference substance popup,
mobile effect citation disclosure, 22 focused tests, and TypeScript.
Authenticated production editing was not exercised. Roll back to
`dpl_HDqYPrHQUbysredBdoqpuw7Hgquj` using the explicit scope above.

The 2026-09-07 About-page release serves `dpl_EssXvXMrXV7JrWCdCkki3SGTr7Rz`
on both public DoseWiki hosts and `dpl_9uhCvYeCxrRC9ssoaJt5a9NShNhk` on
both editor hosts. Each source inventory matches its preceding production
deployment except for 15 About-related files and a build-command override that
explicitly skips Convex deployment. The public upload contains 4,996 files;
the editor upload contains 4,994. Effect Index was not deployed.

Both builds passed compilation, TypeScript, static generation, and the
artifact audit: zero editorial browser modules in the public build and 299
in the editor build. Live desktop/mobile checks confirmed the new About
section order, formal prose, contact wording, count placeholders, and working
anchors. Editor document/RSC sign-in redirects, private API 401s, sign-in
rendering, and private/noindex headers were verified. Authenticated production
editing was not exercised.

Evidence: `runs/about-page-release/2026-09-07-about-clarity.json`. Rollback
targets are public `dpl_7G72TVSBmQeDNj5TvypXVZaWi9so` and editor
`dpl_ATw2BKyuFY261dQiXRB1mnMYQ8zm`, using the explicit scope above.

The 2026-09-07 embed-chrome release serves `dpl_6Bsn1JMaYttuYhJ62TrER1yWdM9L`
on both public DoseWiki hosts. Its isolated source uses snapshot
`65e4f167f9dca88afa9fb7b0397c0e604c828f6b` plus the preceding About/social-card/
embed-policy overlays and two replication files. Framed by an allowed parent,
`/embed/replications` now renders only the showcase card: the collection heading
and the media-terms line are suppressed because the host section supplies both.
Opened top-level on dose.wiki the document keeps them. Per-work creator credit
in the stage scrim is unchanged. The build explicitly skipped Convex; the editor
and Effect Index were not deployed. Live checks confirmed heading and terms
present top-level and absent inside a frame with `parentOrigin` set. Evidence:
`runs/replication-embed-chrome/2026-09-07-embed-carousel-only.json`. Roll back to
`dpl_EssXvXMrXV7JrWCdCkki3SGTr7Rz` using the explicit scope above.

The 2026-09-08 replication-order release serves `dpl_HzjGJgQTLqrDZSiGsJ1m7Cgvdhfm`
on both public DoseWiki hosts. It publishes the operator-approved curation
orders for all 7 eligible drug collections and all 49 nonempty effect-article
galleries: 12,752 ordered positions, verified exact against both Convex and
`https://dose.wiki/api/replications/showcase` for all 56 collections. Membership
was never changed; every publication was an order-only permutation.

The public release was required because the preceding build predated the
ordering path, so the published orders were invisible while Convex already held
them. Cache invalidation alone did not surface them; the tags in
`lib/convex/publicData.cache.ts` were expired on both projects first and ruled
the data cache out.

The backend release lifted two gates in `publishCollection`. The deployed body
capped every collection kind at 250 works, which blocked the 15 collections
above that size, and the checkout already scoped that cap to playlists and
artists. Showcase eligibility also gated every member, refusing 343 combination
and 33 showcase-excluded works that legitimately belong to effect galleries;
eligibility now applies only to substance placement. Effect and artist orders
remain order-only, so presence is already the membership decision.

Convex functions were deployed to `glad-minnow-656` through the committed-source
gate; the strict live inventory matched all 351 checkout functions. Effect Index
and the editor hosts were not redeployed. Audio suitability across the published
corpus remains pending human listening, and 782 members carry an uncleared
flash risk sequenced late with `mustNotAutoplayPendingHumanReview`; none were
cleared by this release. Evidence is retained in the curation run's
`dossier-verification.json`. Roll back the public release by promoting the
deployment previously aliased to `dose.wiki` with the explicit scope above.

The 2026-09-08 aggregated-embed release serves `dpl_HiRd8QsTVUuTSu2NqcfK48pUvuRW`
on both public DoseWiki hosts, adding five files to the preceding overlay set.
A multi-slug embed now skips a slug that resolves to no collection, a
replication tag with media but no effect article previously threw and blanked
the whole player, which is why every ESEI category above it showed the host's
recovery card, and fails only when nothing resolves. The compact showcase
takes one work per group per round, so a category opens on a spread of its
effects rather than the whole first one; the viewer's per-effect groups and
their curated order are unchanged. The frame no longer scrolls itself
(`overflow: hidden` in `embed.css`, root-only height reporting), which also
ends the two-height resize oscillation. Convex, editor and Effect Index were
not deployed. Evidence:
`runs/replication-embed-chrome/2026-09-08-aggregated-embed.json`. Roll back to
`dpl_6Bsn1JMaYttuYhJ62TrER1yWdM9L` using the explicit scope above.

The 2026-09-08 cached-publication release serves these production deployments:

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_3ayX8hgh7qLtf51sWC6Q5AA3NYwe` | `dpl_HiRd8QsTVUuTSu2NqcfK48pUvuRW` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_9GBwPyAgDxVDPQCNqNW5Z8YAWA3b` | `dpl_9uhCvYeCxrRC9ssoaJt5a9NShNhk` |
| effectindex.com | `dpl_HvYnmsxhqvxX8aVuhzceJYXDJNWY` | `dpl_8xriWNfJdK4V6iEPEUxVoksKYJEh` |

The guarded Convex release uses snapshot
`2994e58d288a55be23ed0bf063c35da4ca9eaf36`; the final editor source uses
`9fbdf795083f98c8e9a8c0c5a4d68c9158a77507`. Each application release overlays
its preceding production inventory rather than publishing unrelated checkout
changes. All three production builds passed compilation and their artifact
audit. Both public artifacts contain zero editorial browser modules and zero
browser Convex clients. The editor retains its application-auth boundary.

The live headless editor publication endpoint returned accepted and verified
receipts for the current LSD revision on both canonical public hosts. Public
RSC article responses subsequently returned cache hits. Chromium confirmed
article rendering and search-to-effect navigation without direct Convex
resource requests. Missing and invalid editor tokens returned 401; editor
documents retained sign-in redirects, private cache headers and noindex.
Signed public receivers rejected unsigned, stale and unknown-identity signals.
Live molecule checks confirmed immutable matching revisions and no-store
errors for stale, malformed and duplicate revisions.

Cloudflare Worker `dosewiki-media` now runs version
`0d20e934-b85f-4741-8181-c07739ccb4bf`, retaining the existing private
`replications` R2 binding. Live HEAD/range delivery and CORS passed. Withdrawal
and restoration were exercised against local R2 state, not live content.
The preceding Worker version is `03c93558-bc6b-4bda-bf59-d0e4b0d59866`;
do not restore it while withdrawal markers are active because it lacks their
guard. Application rollback does not restore content or justify removing the
durable publication queue.

Evidence and source inventories are retained under
`runs/cached-publication-release/`. No article content or live withdrawal marker
was changed for verification. No cost reduction or signed-in editor UI session
is claimed. Targeted regressions passed; the interrupted aggregate rerun is
not represented as a full-suite pass.

The 2026-09-08 gallery-and-reports release serves these production deployments,
all built from commit `8e64c666` on `no-corpus-drain`:

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_G1pZgizxN2ogaHGBpURUmicTAayx` | `dpl_HzjGJgQTLqrDZSiGsJ1m7Cgvdhfm` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_1n2ms6UkWP1Mt3sFpyS3zTzsx7j9` | `dpl_9GBwPyAgDxVDPQCNqNW5Z8YAWA3b` |
| effectindex.com | `dpl_17uYSRwMyxkjDUn8MQuxrqSADvDg` | `dpl_HvYnmsxhqvxX8aVuhzceJYXDJNWY` |

This is an application-only release of public reading surfaces: gallery tiles
keep their caption on phones and carry one corner chip for medium, video
duration and a defensible work year; the replications section heading is
accessible-only on the Gallery tab; the trip reports index gains collapsible
per-group shelves, a spotlight, and query-string filter, sort and search state.
Every project uploaded 5,132 source files from the same tree.

No Convex functions were published. The public and Effect Index projects hold
no deploy key, and the editor build was run with `--build-env
CONVEX_DEPLOY_KEY=`, so all three logged `Convex functions will NOT be deployed
by this build`. The checkout-only call-site integrity check passed in each.

The first Effect Index attempt (`dpl_9NUEc48vzQAfPhsL2GUkGs8SP8Ut`) failed
while prerendering `/pipradrol`: `glad-minnow-656.convex.cloud` returned a
Cloudflare 520 during static generation. The unchanged source succeeded on
retry once the backend answered again. No Convex or provider setting was
changed.

Live checks: `dose.wiki/reports` serves the new index with its spotlight and
shelves at desktop and 390px; `dose.wiki/replications` opens on artwork with
chips reading duration and year, including the `≤2022` upper-bound form; the
collapsed gallery search resolves its placeholder to `transparent` at rest and
to `--theme-text-faint` on focus through `.theme-collapsed-search-input`;
`effectindex.com/reports` renders the same index in its own flavor. Anonymous
`dev.dose.wiki/dev` still redirects to sign-in and
`POST /api/dev/revalidate-article` without a token still returns 401.
Authenticated production editing was not exercised.

Local gates before the release: 613 test files and 5,873 tests passed, and
`tsc --noEmit` was clean. Two failures that predated the change were repaired
rather than deferred, one in the copyBlocks write harness and one in the theme
token audit baseline.

The 2026-09-08 replications control-bar release serves these production
deployments, all built from commit `ed20c6f2` on `no-corpus-drain`:

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_S3rqW84P7xR86cuPwBnGMtCxEowy` | `dpl_G1pZgizxN2ogaHGBpURUmicTAayx` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_8HY6omGkx3rsjkt8L9ts8y7BjKcC` | `dpl_1n2ms6UkWP1Mt3sFpyS3zTzsx7j9` |
| effectindex.com | `dpl_9o5QMXTB1ZLzQ7gNULfpRNEpfioU` | `dpl_17uYSRwMyxkjDUn8MQuxrqSADvDg` |

This is an application-only release of the replications gallery chrome. Every
control in the index's sticky bar is one labelled menu button (glyph, current
value, chevron) from `md` up, and folds to its glyph below `md`, where the menu
still carries every name; both desktop toggle groups and their phone twins are
gone. The bar holds one 52px row at every width, replacing the 110px two-row
layout it took across the whole 640-1023px band. The corpus census moved to the
tab row, server-rendered, and a status line under the bar reports the filtered
count against the archive only while something narrows the grid. Seven files
changed; each project uploaded 5,037 source files from an isolated worktree at
that commit, so the concurrent `scripts/` work in the shared tree was excluded.

No Convex functions were published. The public and Effect Index projects hold no
deploy key and the editor build ran with `--build-env CONVEX_DEPLOY_KEY=`, so all
three logged `Convex functions will NOT be deployed by this build`. The
checkout-only call-site integrity check passed in each.

Two public upload attempts failed before the third succeeded: the Vercel CLI hit
`SSL alert number 20` (`bad record mac`) against `api.vercel.com` on the file
upload. The transport recovered on retry with unchanged source; no provider or
account setting was touched.

Live checks: `dose.wiki/replications` serves a 52px single-row bar with `By
artist`, `All media`, `Videos first` and `Filters` as text, a 9px container
radius and no border (the hairline is now the shadow's first layer alone), first
artwork at y=246 where it was y=362; `?type=video&viewing=open-eye` reads `2,196
of 6,607 works` beside its removable chip with the media and filter glyphs tinted
accent; the tab row carries `6,607 works · 2,117 artists · 44 effects`; 390px
serves three glyph triggers plus a 208px field on one row with the rail's sticky
artist label resolving to `top: 128px`, matching
`--replications-control-bar-height` exactly for the first time. Anonymous
`dev.dose.wiki/dev` still redirects to sign-in, `POST
/api/dev/revalidate-article` without a token still returns 401, and
`effectindex.com/reports` still renders. Authenticated production editing was not
exercised.

Local gates before the release: 613 test files and 5,870 tests passed with
`tsc --noEmit` clean, then 43 files and 548 tests re-run after the final geometry
pass. Seventeen explorer tests moved with the changed contract rather than being
re-pinned. The theme token audit passed with 851 baseline findings and no new
ones.

The 2026-09-09 replication-ordering release serves these production deployments,
all built from commit `f4b91ae5` on `no-corpus-drain`:

| Surface | Deployment | Rollback deployment |
| --- | --- | --- |
| dose.wiki and www.dose.wiki | `dpl_DqqJGPMCw16whcxYt5DqBULh5NU1` | `dpl_S3rqW84P7xR86cuPwBnGMtCxEowy` |
| dev.dose.wiki and dosewiki-admin.vercel.app | `dpl_4utomjXBHiCMV3wfLfMpseDBaaBd` | `dpl_8HY6omGkx3rsjkt8L9ts8y7BjKcC` |
| effectindex.com | `dpl_ABn3dPyrG4zcTWpwRBoFdLgRXEhG` | `dpl_9o5QMXTB1ZLzQ7gNULfpRNEpfioU` |

This release makes the replication index honour the 2026-09-08 curation orders
it had never shown, and turns artist playlists into timelines. Convex now
projects `effect_order_index`, one curated position per depicted effect,
replacing a single `order_index` scalar that could only carry the owning
effect's rank; `groupByEffect` buckets by every effect a work depicts, the same
`depictsEffect` union the effect article uses, and applies each effect's own
prefix above the audio-first media rank. Artist surfaces sort by work date
alone through `sortArtistWorks`, so the Effect Index featured float and
`contributorProfiles.replicationOrder` no longer reach them; that field is still
stored and still writable from the contributor editor, but nothing public reads
it, and its dead read plumbing is gone from the contributor directory payload.
The public `/api/v1` `order_index` is derived from the map and unchanged.

Each project uploaded from an isolated worktree at that commit, so the
concurrent `scripts/` feedback-register work in the shared tree was excluded.
The public and Effect Index projects hold no deploy key and the editor build ran
with `--build-env CONVEX_DEPLOY_KEY=`, so all three logged `Convex functions
will NOT be deployed by this build`. Convex was published separately and last,
from a workstation through `npm run convex:deploy -- --prod
--from-head-worktree --confirm`, after every app build was live: the new code
ignores the old scalar, so app-first has no window where a live build reads a
projection it does not understand, whereas Convex-first would have flattened
curated order everywhere until the builds landed. The strict live inventory
matched all 351 checkout functions before and after.

`dose.wiki` was redeployed once (`dpl_8CmW6Q1jfmJmoF95G4GWLhQAYkGX` →
`dpl_DqqJGPMCw16whcxYt5DqBULh5NU1`) purely to flush one CDN object. The gallery
corpus route answers `Cache-Control: public, max-age=3600`, and a response
captured between the app deploys and the Convex publish held pre-publish rows;
the origin was already correct. `PUBLIC_CACHE_PUBLISH_SECRET` could not be used
to expire the tag instead: `vercel env pull` returns an empty value for it, so
the signal cannot be signed from a workstation.

Live checks: the Convex projection drained through all 110 pages gives 6,627
curated positions across 49 effects with 47 works at position 0, and both
`dose.wiki` and `effectindex.com` serve exactly that. All 43 effect rails in
`/replications?view=effect` open on their article's `showcase[0]`, verified
against `/api/replications/showcase?effect=`. Artist rails descend by work date
with media interleaved: Symmetric Vision opens on eleven 2026 works, Oracle
Emissary places a 2024 image above nine 2022 sounded videos, Cold Wasabi is
stills 2022 down to 2020. `/replications/artist/symmetric-vision` and
`/contributors/SYMMETRIC VISION` both open on `balls-being-tripped-at-modem`.
Authenticated production editing was not exercised.

A verification caveat worth keeping: an intermediate audit reported 25 of 43
rails mismatched. That was the headless browser replaying its own cached corpus
response (`transferSize: 0`, 2ms) from before the Convex publish. Disabling the
browser cache and clearing it fetched 1.53 MB fresh and reported 43 of 43. Any
future audit of this surface must defeat the one-hour client cache on
`/api/replications/gallery` before believing a mismatch.

Local gates before the release: 613 test files and 5,868 tests passed with
`tsc --noEmit` clean, and `npm run verify:app` built the public artifact with
the audit reporting zero editorial browser modules. Six tests that pinned the
removed curation contracts were deleted rather than re-pinned, and two viewer
tests that hardcoded a fixture's sort position now assert the tile they click.

Public caches are project-local, so an editor-side invalidation reaches only
the editor project. Editorial writes therefore publish across deployments: the
seam in `lib/next/publishPublicCache.ts` expires the editor project's own
caches, then POSTs the affected content identities to
`/api/public-cache/revalidate` on every origin in `PUBLIC_CACHE_PUBLISH_TARGETS`,
signed with `PUBLIC_CACHE_PUBLISH_SECRET`. The receiver accepts identities
only; it derives paths and tags itself from `lib/next/publicCacheContract.ts`,
so the secret grants cache expiry and nothing else. Effect Index keeps its
credential-free read-only Convex role.

Configure the shared secret on all three Vercel projects and production
Convex. Configure `PUBLIC_CACHE_PUBLISH_TARGETS=https://dose.wiki,https://effectindex.com`
on the editor project and production Convex only. Public projects receive no
Convex mutation credentials. Missing configuration is reported as
`unconfigured`, never as successful delivery; existing revalidation intervals
remain a fallback.

A save response carries a `publication` receipt per target: `accepted`,
`rejected`, `unreachable` or `unconfigured`. `accepted` confirms the correlated
invalidation acknowledgement, not rendered freshness. Article saves additionally
compare the committed public revision with
`<meta name="dosewiki-public-revision">` in canonical public HTML and report
`verified`, `mismatch` or `unreachable`. A removal verifies only an actual 404.
A committed write with incomplete public delivery is a partial publication,
never a save failure.

Indexed public writes transactionally coalesce affected identities in
`publicCachePublications`. The `publicationDelivery:reconcile` cron runs each
minute, leases at most 24 due identities for 120 seconds, dispatches six at a
time, and retries with backoff capped at five minutes. Generation checks prevent
an old acknowledgement from completing a newer write. Article recovery remains
pending until delivery and revision verification succeed. Private drafts,
accounts, intake, proposals and evidence do not enter the public outbox.

For an immediate retry, use authenticated
`POST /api/dev/revalidate-article` with the affected article slug or slugs.
It reads the current public revisions and returns the same delivery and
verification receipts. Do not report publication complete from `ok: true`
alone. Duplicate or out-of-order signals only expire caches and re-read current
Convex data; they never carry or restore an older content revision.

For an editor rollback, restore a previously verified editor deployment with
the same application-auth boundary. Keep public domains on a public-only
artifact. Do not restore the former mixed public/editor topology as a shortcut.
For a controls-only rollback use the build flag below. Never disable server
authorization, expose credentials, or replay rejected writes during recovery.

#### Contextual editing and article draft recovery

The editor artifact renders the public reading layouts with an explicit
eye (**View**) / pencil (**Edit**) control. View is the default. Supported fields
open inline controls, section panels, or the existing replication viewer editor.
The wrench remains a separate route to specialist workbenches.

| Surface | Contextual operation | Permission boundary |
| --- | --- | --- |
| Substance articles | Prose, structured sections, references, private drafts, proposal review, publication, guarded restore | Editors draft and submit; admins publish and approve |
| Effects and writing | Parser-backed source editing, rendered preview, scoped publication review | Existing editor/admin permissions |
| Showcases and playlists | Membership and order review inside the viewer | Existing collection permissions; contributor-owned playlists remain owner-scoped |
| Replications | Canonical metadata correction with revision checks | Separate from playlist ownership |
| Artist profiles and published reports | Ownership-aware corrections with retained attribution and media | Existing owner/admin boundaries |
| About, shared copy, and indexes | Block or display-field editing with explicit affected scope | Existing editor/admin review and publication boundaries |
| Article warnings | Separate article assignment and shared preset operations | Admin-only; shared impact shown before publication |

Article sections use the same account-bound session in reading pages, the
substance workbench, and review mode. **Save draft** persists only the current
account's private article draft. Local preview changes neither the published
article nor its saved draft. Publishing, submitting, discarding a saved draft,
and restoring a revision remain separate operations.

An expired session conceals private article content. Unsubmitted form values
remain in the account-bound session while that tab stays open. Signing in as the
same account does not replay a write. Enter Edit to resume, then explicitly
refresh and reconcile a rejected baseline. Switching to another account creates
a fresh editor session and cannot expose the previous account's draft.

Article reads fetch one article, at most one owner draft, four recent revisions,
and four proposal summaries through indexed queries. They do not subscribe to
the complete draft or proposal corpus. The application and Convex both enforce
write permissions; presentation controls are not an authorization boundary.

Before activating contextual proposal history on an existing deployment,
complete the approved `articleLifecycle:backfillArticleProposalTargets` internal
mutation. It processes eight proposals per call and returns a cursor and
`isDone`. Continue with the returned cursor until complete. This is a separate
production write: run `npm run convex:doctor`, follow
`docs/agents/convex-credentials.md`, set `TARGET_CONVEX_URL` explicitly, and obtain
the required operator confirmation. No backfill is performed by a local build.

For a controls-only rollback, rebuild with
`NEXT_PUBLIC_CONTEXTUAL_EDITING=false`. Public data, saved drafts, and existing
workbench access remain intact. This switch does not replace application
authentication or server-side authorization.

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

| Reading surface | Workbench shortcut |
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
whose last production deployment was from June 2026, the edge response carried
`age: ~6.3e6` seconds, and its chunk set was disjoint from `dosewiki-admin`'s.
Anything merged here reached `dosewiki-admin.vercel.app` and nothing else, which
is why the public holding page looked nothing like the one in this repository.

From 2026-08-22 until the 2026-09-06 public/editor split above, both public
domains resolved to `dosewiki-admin`. The CLI could not reassign a domain
attached elsewhere; the 2026-08-22 move used the REST API, deleting
`/v9/projects/dosewiki/domains/<name>` and posting the name back to
`/v10/projects/dosewiki-admin/domains`. Nameservers were already Vercel's, so
neither domain needed re-verification.

The `dosewiki` project still exists and still holds `dosewiki.vercel.app`. It
serves nothing anyone links to; leave it alone or delete it, but do not deploy
to it.

## Effect Index (`effectindex.com`)

Effect Index is a separate Vercel project on the same repository and branch as `dosewiki-admin` and `dosewiki-public`, built with the same install and build commands (`vercel.json`: `bun install --frozen-lockfile` / `bun run build:vercel`). It remains a credential-free public artifact, never an editor or intake service.

## Shipping the app ships the Convex functions

**This changed.** The app build used to be a plain `next build`, so Convex
functions moved only on a manual `convex deploy` and an app release could
outrun the data layer, which is exactly how inline click-to-edit broke for a
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
projects. Effect Index is deliberately read-only, no `CONVEX_URL`, no
`CONVEX_ADMIN_KEY`, no auth secrets, and an unconditional `convex deploy` in
the shared command would either break its build outright or, if it were ever
handed a key to "fix" that, give a public marketing deployment a write path into
the production database. Keying the behaviour off `CONVEX_DEPLOY_KEY` means
Effect Index stays read-only **by the same omission it already relies on**: it
simply never gets the key, and it keeps building.

The verify path is not a rubber stamp. It still enforces the credential-free
half of the drift gate, every Convex function the app names must exist in this
checkout, and it prints `NOT VERIFIED` about the half it could not check
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
   is not published, the script says so before it runs.
3. **Strict drift check** against the target first, which is the guard for the
   silent-deletion direction.
4. **`--confirm`** is required to publish anything. Without it the gates run and
   the script stops.

#### When a guard trips

- **REFUSING: uncommitted change(s) in the publish surface**: commit them, or
  re-run with `--from-head-worktree` to publish HEAD and leave them behind.
- **AT RISK OF SILENT DELETION**: the listed function is live on the deployment
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
- **MISSING from the deployment**: the app calls something no deployment has.
  That is the outage this whole section exists to prevent, and deploying is the
  fix.
- **Vercel build refuses with "preview key on a production build"**: the
  Production environment holds the wrong `CONVEX_DEPLOY_KEY`. Replace it with a
  production deploy key; do not delete the guard.
- **Vercel production build fails the pre-deploy drift check**: production has a
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

- `CONVEX_DEPLOY_KEY`: the ability to publish Convex functions. With no key,
  the shared `bun run build:vercel` command verifies and never deploys. See
  [Shipping the app ships the Convex functions](#shipping-the-app-ships-the-convex-functions).
- `CONVEX_URL`: the explicit privileged write target. Compatibility resolution
  may still identify `NEXT_PUBLIC_CONVEX_URL`, but no write capability exists
  without an accepted admin credential.
- `CONVEX_ADMIN_KEY` and every `CONVEX_ADMIN_TOKEN_*` intent token, without an
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
served by `bun run build && bun run start`, and by Vercel, runs all of it.
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
- The share token in that file is public by design, the dashboard is world-readable. Rotate it by re-sharing in PostHog and redeploying.
- The subdomain previously served a self-hosted Umami instance on Railway, which only ever answered on this hostname (`i3voap3t.up.railway.app` itself returns 404). Restore it with `vercel dns add dose.wiki analytics CNAME i3voap3t.up.railway.app`; the `_railway-verify.analytics` TXT record is retained for exactly that.

### Content imports and public freshness

Public routes are prerendered (SSG) or incrementally revalidated. `PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS` in `lib/convex/publicData.cache.ts` is **900 seconds (15 minutes)**.

Imports through the indexed mutation boundary now enqueue durable publication
identities even when they bypass the editor. Recovery dispatches them to both
public projects. An import that bypasses that boundary still requires an
authorized targeted revalidation. Verify the canonical public response and
article revision receipts rather than assuming a committed write is already
published. Revalidation intervals are demand-driven, not timers that regenerate
every article; elapsed time or an editor-host response is not freshness proof.

Mutable effect, writing, category, mechanism and psychoactive route families
resolve new identities on demand rather than requiring a new prerender list.
Chemical-class routes are also on demand, but introducing a new bundled
chemical taxonomy definition still requires a code deployment.

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
- [ ] `/sign-in` and the editor routes fail, confirm this, it is the expected read-only posture.

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

Public flavors build into `.next`; editor/local-development builds use `.next-editor`. Stop any process owning the selected output before building. Do not temporarily override `distDir` or bypass the audited build command. Start the production server with the same `DOSEWIKI_BUILD_SURFACE` and publication environment used for its build.

```bash
DOSEWIKI_BUILD_SURFACE=public \
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
