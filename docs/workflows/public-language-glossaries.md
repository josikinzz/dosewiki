# Public language glossaries

`/glossary` remains the English reference; the existing Chinese mirror glossary
is unchanged. `/glossary/languages` lists participating translation languages
with stored rows. `/glossary/[locale]` shows proposed, approved and missing
translations, English definitions, category/search controls and source usage.
The public projection excludes reviewer identity and private feedback. Pending
workbench drafts are shown as proposed wording while the effective approved
term remains unchanged. Pages and transactional feedback validation use the same
single-query snapshot of canonical and review rows. Feedback versions and release
evidence include the review revision, so an intervening draft, approval or restore
invalidates older feedback forms and readiness evidence even if wording repeats.

The homepage language menu replaces the bottom-left supporter mark. An
unreleased language links to its glossary; released websites keep a glossary
link in the directory. Locale identity comes from the translation locale names,
not the mirror-host registry, so glossary participation does not launch a mirror.

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

Verification seams: `src/app/api/glossary-feedback/route.test.ts` runs the real
POST, service allowlist, native callables and SQL against isolated PGlite with
all migrations. UI tests cover bilingual filtering, failed drafts/retries and
menu focus. Readiness fixtures cover missing terms, drafts, missing checks,
expired evidence and a complete release. Public routing also needs a
production-shaped build and browser checks.

## Local verification, 2026-09-21

The focused suite passed 91 tests. A production-shaped public build against an
isolated Postgres fixture passed, and its artifact audit found no editorial
browser modules or browser Postgres clients. Chromium checks passed Arabic
search, reaction restoration across tabs, clearing, mobile overflow, language
menu destinations and Escape focus, unknown-locale 404, and the English glossary.
Mobile light and dark screenshots were inspected.

The broader suite recorded 6,147 passing tests and no failures before the
existing `MoleculeQuickEditor.test.tsx` hung. That hang reproduced in the original
checkout, so the full suite is not reported as complete. No production migration
or deployment was performed.
