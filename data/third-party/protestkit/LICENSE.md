# ProtestKit reagent-test data

`reagentTests.json` is a point-in-time snapshot of ProtestKit API v1 substance responses (<https://protestkit.eu>), keyed by dose.wiki slug. It is third-party material and is not covered by the repository's MIT license or by the dose.wiki CC0 release described at `/docs/license`.

Terms: used with ProtestKit's permission; redistribution terms are on file with the dose.wiki maintainer. Not CC0. Refresh the snapshot only with ProtestKit's permission and an explicit operator run (`npm run reagents:cache`, recorded in `data/lineage.json` as `reagent-tests-snapshot`), then import through the guarded Postgres workflow.

Modifications by dose.wiki: responses are stored verbatim under the matching dose.wiki slug; substances ProtestKit has no entry for are recorded as `null`.

See `NOTICE.md` at the repository root for the full third-party inventory. Rights questions: <contact@dose.wiki>.
