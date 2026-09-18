/**
 * The replications section's description, editable in the /dev Copy Studio
 * under the `replications-intro` block (Replications group).
 *
 * It used to render as the section header's standing description on every
 * tab; it now leads the More Info tab instead, above the fair-use notice, so
 * the Gallery opens straight into the media. The migration pin test
 * (`copyBlockMigration.test.tsx`) holds this fallback equal to the checked-in
 * default in `copyBlocks.json`, so an un-seeded deployment renders exactly
 * this sentence.
 */
export const REPLICATIONS_INTRO_KEY = "replications-intro";

export const REPLICATIONS_INTRO_FALLBACK =
  "Image, video, and audio recreations of the sensory experiences produced by subjective effects.";
