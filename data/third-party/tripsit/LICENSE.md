# TripSit drug-combination data

`tripsit-combos.json` and `combo_definitions.json` are derived from TripSit's drug combination chart (<https://wiki.tripsit.me/wiki/Drug_combinations>, <https://combo.tripsit.me>). They are third-party material and are not covered by the repository's MIT license or by the dose.wiki CC0 release described at `/docs/license`.

TripSit's terms, as restated in `/docs/license` section 4:

- non-commercial use only;
- attribution to TripSit;
- a link back to TripSit or <https://combo.tripsit.me>;
- a note that the information is only a quick reference and not a substitute for research.

Modifications by dose.wiki: entries are keyed by dose.wiki slug and normalized into the `interactions` field of article documents (`scripts/parsers/tripsit-combos.ts`). The status legend in `combo_definitions.json` is carried unchanged.

See `NOTICE.md` at the repository root for the full third-party inventory. Rights questions: <contact@dose.wiki>.
