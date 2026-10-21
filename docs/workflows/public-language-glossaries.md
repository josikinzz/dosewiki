# Public language glossaries

`/glossary` uses one shared glossary renderer. English shows the reference definitions;
`zh.dose.wiki/glossary` and `ru.dose.wiki/glossary` show the language's translations
and per-term suggestions, including terms without a translation. Languages without
a mirror use `/glossary?locale=<code>`. Old `/glossary/<code>` addresses permanently
redirect to the corresponding merged page. `/glossary/languages` lists participating
translation languages with stored rows. Translation terms show an English definition,
source usage, and one of four statuses: "Checked by a person", "Machine suggestion",
"Live, not yet checked", or "Not translated yet". Human-checked badges are green;
unchecked badges are red, with readable status text in both themes.
Category, status, and search filters combine. The public projection excludes
reviewer identity and private feedback. Pending workbench drafts are shown as
proposed wording (a suggestion) while the effective approved term remains
unchanged.

The page is the public place to crowdsource a language's terms. A banner above
the list invites readers to help and explains that the suggest button on any
term opens its proposal box; the reference page shows the same banner, pointing
at the language glossaries instead. A progress line
counts terms checked by a person. Terms that still need a person come first, in
a "Needs a person" section; checked terms follow in their own section. Both are
ordered by how much a person adds over the drafting model
(`sortByReviewPriority` in `languageGlossary.ts`): the harm-reduction register
and article labels and scales, then the Subjective Effect Index, then site
wording, then chemical class and reagent names. Effect names are coined, so the
wording settled here becomes the standard for that language; chemical names
follow IUPAC conventions and want a specialist check rather than a crowd, so
they stay listed and filterable but come last. Within a tier the order is not
translated, machine suggestion, then live but unchecked, with each kind kept
together. Clicking a term opens its suggestion box in place,
one term at a time. The box leads with the reader's own translation and an
optional reason; "Looks right" / "Needs improvement" reactions sit below it and
appear only when there is wording to react to.

A term is "Checked by a person" only when the newest recorded approval carries
the exact live wording and names the reviewer the row names, the same rule the
workbench applies. The comparison runs in the rendering SQL, so no reviewer
identity leaves the database. Legacy approvals without that record read "Live,
not yet checked" until someone confirms them in the workbench.

Each term may show one in-context example: the first current usage from its
source-usage list whose segment has a stored translation in that language, with
the English and the stored translation both trimmed around the term (the shared
term matcher in `scripts/translation/term-match.mjs` finds the English form). A
term without such a usage shows no example. Status and link copy come from the
UI catalog (`languageGlossary.*` message IDs). Pages and transactional feedback validation use the same
single-query snapshot of canonical and review rows. Feedback versions and release
evidence include the review revision, so an intervening draft, approval or restore
invalidates older feedback forms and readiness evidence even if wording repeats.

The homepage language menu replaces the bottom-left supporter mark. An
unreleased language links to its glossary; released websites keep a glossary
link in the directory. Locale identity comes from the translation locale names,
not the mirror-host registry, so glossary participation does not launch a mirror.

## Translation credits

Each translation language can credit the people who contributed to it. A credit
names an existing contributor profile and adds one contribution line; it is
stored per locale as `translationCredits` on the About `siteConfig` document
(`{ [locale]: [{ profileKey, contribution }] }`, at most 24 per language, 240
characters per line). Admins edit it at `/dev/writing/about` (Writing, About), in the
Translation credits section below the Founders list, and publish it with the
About save. `/glossary/[locale]` and that locale's mirror of `/about` and
`/glossary` show a "Translation contributors" block (`translationCredits.title`)
with each display name linking to the profile's first external link, or to its
`/contributors/<key>` page, followed by the contribution line. Only public
profile fields reach the page. With no credits the block is omitted.

## Feedback boundary

The public `/api/glossary-feedback/identity` GET establishes an HttpOnly, SameSite=Strict
browser cookie and returns only that browser's current reaction. Its read budget
is separate from `/api/glossary-feedback` POST, which requires same origin, the existing public feedback rate
limit, the existing Turnstile configuration, and the exact public-intake token.
`SITE_FEEDBACK_IP_HASH_SECRET` (or the existing documented feedback-secret
fallback) hashes this random cookie identity. No raw IP address is stored.
Clearing cookies permits another browser identity; this is not one vote per human.

`glossaryFeedback:create` and `glossaryFeedback:createReaction` are the only
added service operations. Both are create-only, validate the current term inside
the serializable transaction, and obey the global write freeze. No public
operation edits glossary content, approves terms, or enqueues translation work.

A term with no rendering in the language takes a first translation: its
version is `MISSING_RENDERING_VERSION`, the stored target is empty, and the
suggestion must carry a translation, not only a comment. The term must have an
English definition or a rendering in some language (`isKnownGlossaryTerm`), and
the version goes stale as soon as any rendering exists. Such a term takes no
reactions. In the workbench it reads "not translated yet".

Suggestions retain locale, term, target snapshot and exact version. The same
browser and request ID replay without another row. Reusing an ID for different
content fails. Reactions are append-only events: the latest event per browser,
term and version is the effective choice. A clear event removes that choice
from aggregates. Reactions do not create queue tasks and totals are private.

`/dev/glossary` exposes the existing review queue through a glossary adapter,
plus reaction totals and release diagnostics. The route and native callable both
require Translator access to the selected locale; admins retain access. Review
status changes update only feedback metadata. Public artifacts contain no
review UI or editorial credential.

## Website readiness

The required term set uses the same `collectGlossaryTerms` producer as drafting.
Every required term must exist, have a nonempty target, and be approved; any
remaining draft also prevents completion. Definitions alone and zero draft
counts cannot certify required-term coverage.

`src/i18n/languageReleases.json` is an explicit, reviewed release ledger. It
starts empty because this implementation verified no live release. A record is:

```json
{
  "locale": "nl",
  "host": "nl.dose.wiki",
  "checkedRevision": "<40-character source commit>",
  "checkedAt": "<ISO date>",
  "expiresAt": "<ISO date>",
  "glossaryRevision": "<digest from the readiness endpoint>",
  "contentCoverage": true,
  "interfaceCoverage": true,
  "routesVerified": true,
  "deploymentUrl": "https://<verified-deployment>.vercel.app",
  "released": true
}
```

Only record this after the locale runbook's content and rendered-interface
coverage checks, route checks, deployed revision verification and explicit
release approval. The record's host must be the verified DoseWiki subdomain.
A glossary/required-corpus change or expired record makes evidence stale and
returns the destination to the glossary. `/api/dev/glossary-readiness?locale=`
exposes the current digest and evidence to authorized operators. Cached public
projections refresh within 60 seconds; the required corpus refreshes in five
minutes. The ledger does not deploy or configure a host.

## Release and recovery

Migration `0021_public_language_feedback.sql` adds the private suggestion and reaction
event tables. It is generated from `server/schema.ts` through the schema producer
and Drizzle, and must be applied through the separately authorized migration
workflow before releasing feedback. The local implementation does not authorize
production migration, deployment, glossary backfill, or website launch.

Release the editor review surface and public intake artifacts with their existing
credential tiers. Retain the additive tables and submitted feedback on application
rollback. Remove a release ledger record or set `released` false to withdraw a
website destination; this preserves its glossary.

Two tests cover this feature. `src/app/api/glossary-feedback/route.test.ts`
runs the real `POST` route and the glossary feedback handlers against isolated
PGlite with every migration applied. It
checks that approved wording stays public over a pending draft, that feedback
on stale wording is refused, that wrong credentials, unassigned reviewers and
frozen writes are denied, and that foreign origins and rate-limited requests
are rejected. `src/features/language-glossary/languageGlossary.test.ts` checks
that the public projection lists missing translations and exposes only reader
fields.

No automated test covers the glossary UI or website readiness. Check these by
hand in a browser: bilingual filtering, failed drafts and retries, menu focus,
and each readiness state (missing terms, drafts, missing checks, expired
evidence, and a complete release). Public routing also needs a
production-shaped build and browser checks.


## Glossary interface languages

The English reference is at `dose.wiki/glossary`. Chinese (`zh-Hans`) and
Russian (`ru`) use `zh.dose.wiki/glossary` and `ru.dose.wiki/glossary`.
Arabic (`ar`), Czech (`cs`), German (`de`), Spanish (`es`), French (`fr`),
Hindi (`hi`), Japanese (`ja`), Korean (`ko`), Dutch (`nl`), Polish (`pl`),
and Portuguese (`pt`) use `dose.wiki/glossary?locale=<code>` and have no
language host. Glossary participation does not release a whole-site mirror.

Every translation glossary loads its own compiled catalog inside the shared
route, including languages without a site mirror. Only that language's catalog
is passed to the client. The page, contribute banner, filters, suggestion form,
feedback notices, usage controls (including the source-coverage hover tooltip)
and review badges are localized. Definitions,
English terms and English source examples remain English. Badge colors and the
shared renderer are unchanged.

`src/i18n/glossaryMessageSeeds.json` contains editable interface translations,
not term definitions or records of human review. `uiMessageSeeds.ts` includes
these in the existing catalog producer. Regenerate each affected locale with
`bun --preload ./scripts/postgres/preload-server-only.ts scripts/translation/ui-catalog.ts --locale <code> --offline --write`.
Offline compilation changes local artifacts only and does not establish current
workbench approval. No automated test checks the localized glossary pages, so
open each affected locale's page and check its controls, placeholders, forms
and badges.
