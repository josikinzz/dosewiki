# Chinese search release integration

The authorized search changes were ported into an isolated checkout of current
production `18143553f68f1af391f08983c91eca155a313684`. The older local branch was
not used as a release base. This record describes local integration only.

The port carries the locale-aware server matching, Unicode identity handling,
exact checksum-valid CAS lookup, and outgoing search draft cancellation from
`1d11809e6`, together with keyboard draft clearing from `55f6b5350`.

Current production's compact substance, effect and report summary readers stay
in place. The unified locale projection hashes their complete raw source leaves
and preserves raw effect-summary and report-introduction translations. Two
regression checks failed before that adaptation and passed afterward.

Historical investigation reports and intake proposals are retained under
`docs/reports/`; the maintained public search contract lives under
`docs/workflows/public-search.md`. No old application layout, UI redesign,
translation job, publication job, cron configuration, or environment setting was
replaced. Proposed Chinese aliases and missing-article intake records remain
proposals in this source port; they are not runtime article data.

Verification in this checkout:

- Frozen-lockfile dependency installation completed without changing the lock.
- All 124 tests passed across 11 focused suites covering public readers,
  localized search, suggestions, live navigation, Unicode matching, CAS, and
  manifest serialization.
- `bun run typecheck` passed.
- ESLint passed for every changed TypeScript module and test.
- `git diff --check` passed.

Release artifact builds, production promotion, warming, and live verification
belong to the deployment coordinator. This integration performed no production
data write, deployment, alias change, or environment edit.
