/**
 * The dosage panel's standing disclaimer, editable in the /dev Copy Studio
 * under the `dosage-panel-disclaimer` block.
 *
 * The string lives here, apart from `dosageDurationPlateau`, because the
 * substance route loader is a server module and reads this fallback to build
 * `dosageDisclaimer` for the article props; importing the panel from the server
 * would drag the article component graph across the boundary. It is pinned to
 * the checked-in copy default by `copyBlockMigration.test.tsx`, so an un-seeded
 * deployment renders exactly this sentence.
 */
export const DOSAGE_PANEL_DISCLAIMER_KEY = "dosage-panel-disclaimer";

export const DOSAGE_PANEL_DISCLAIMER_FALLBACK =
  "Doses are population estimates that vary widely between individuals.";
