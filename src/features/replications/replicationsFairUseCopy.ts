/**
 * The replications gallery's fair-use / takedown notice, editable in the /dev
 * Copy Studio under the `replications-fair-use-notice` block (Replications
 * group).
 *
 * The string lives here, apart from the section that renders it, following the
 * `articleDisclaimerCopy` pattern: the gallery route loader is a server module
 * and reads this fallback to resolve the copy, and the migration pin test
 * (`copyBlockMigration.test.tsx`) holds it equal to the checked-in default in
 * `copyBlocks.json`, so an un-seeded deployment renders exactly this notice.
 *
 * The notice folds in the short rights footnote the gallery explorer used to
 * render on this page (creator-retained rights + the licensing-terms link), so
 * the page states its position once rather than twice.
 */
export const REPLICATIONS_FAIR_USE_NOTICE_KEY = "replications-fair-use-notice";

export const REPLICATIONS_FAIR_USE_NOTICE_FALLBACK =
  "**Why this art is here.** We host replications for educational and archival purposes: " +
  "they show what altered states of consciousness actually look and sound like, so you can " +
  "understand these experiences without having them. We believe this non-commercial, " +
  "educational use constitutes fair use. We have tried in good faith to credit every " +
  "artist and to link their pages so you can find and support them. Rights remain with the " +
  "original creator or rightsholder unless an individual item states another license. See " +
  "the [licensing terms](/docs/license#replication-media-terms).\n\n" +
  "If your art appears here and you want it taken down, email " +
  "[contact@dose.wiki](mailto:contact@dose.wiki) and we will remove it. Use the same address " +
  "to correct a misattribution, ask a question, or share more of your work.";
