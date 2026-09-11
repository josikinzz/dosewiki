import { msg } from "@/i18n/messages";

/**
 * The article's standing disclaimers, editable in the /dev Copy Studio under
 * the `dosage-panel-disclaimer` and `tolerance-section-disclaimer` blocks.
 *
 * The strings live here, apart from the sections that render them, because the
 * substance route loader is a server module and reads these fallbacks to build
 * the article props; importing a section from the server would drag the article
 * component graph across the boundary. Both are pinned to their checked-in copy
 * defaults by `copyBlockMigration.test.tsx`, so an un-seeded deployment renders
 * exactly these sentences.
 */
export const DOSAGE_PANEL_DISCLAIMER_KEY = "dosage-panel-disclaimer";

export const DOSAGE_PANEL_DISCLAIMER_FALLBACK = msg(
  "Doses are population estimates that vary widely between individuals.",
);

export const TOLERANCE_SECTION_DISCLAIMER_KEY = "tolerance-section-disclaimer";

export const TOLERANCE_SECTION_DISCLAIMER_FALLBACK = msg(
  "Tolerance timelines are rules of thumb, not exact schedules, and vary widely between individuals and use patterns.",
);
