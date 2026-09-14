import type { GalleryTaxonomyFilterState } from "@/features/effects/gallery/galleryTypes";
import { msg } from "@/i18n/messages";

/**
 * The words the replication surface is made of, kept in a plain module so
 * the translation glossary drafter (`lib/translation/glossaryDraft.ts`) reads
 * the same list the gallery, the viewer and the artist page render. Same
 * split, and the same reason, as `dosageDurationLabels.ts`: a script needs
 * the reader-facing strings, not the component. `msg` is the identity;
 * renderers translate with `t(label)`.
 */

/**
 * The nouns themselves, as they head a section, a tab or a detail page. The
 * catalog has rendered "replication" three different ways when nothing pinned
 * it; the glossary row drafted from this list is what pins it.
 */
const REPLICATION_NOUNS = [
  msg("Replication"),
  msg("Replications"),
  msg("Replicator"),
  msg("Replicators"),
  msg("Replicates"),
] as const;

/** The star beside a name on the index, spelled out as a pill on the Artist Page. */
export const APPROVED_REPLICATOR_LABEL = msg("Approved replicator");
/** A distinct status from approval; the two must never share a rendering. */
export const VERIFIED_REPLICATOR_LABEL = msg("Verified replicator");
/** The bucket every uncredited work lands in; never "Anonymous" or "Unknown". */
export const UNATTRIBUTED_LABEL = msg("Unattributed");

/** The viewer's grouping unit when works are browsed by artist. */
export const ARTIST_LABEL = msg("Artist");
export const ARTISTS_LABEL = msg("Artists");

export type TaxonomyFilterKey = keyof GalleryTaxonomyFilterState;
export type TaxonomyFilterOption = { value: string; label: string };

/** Key order is the render order of the filter popover: selects, then active-filter chips. */
export const TAXONOMY_FILTER_OPTIONS: Record<TaxonomyFilterKey, ReadonlyArray<TaxonomyFilterOption>> = {
  effect: [{ value: "all", label: msg("Any") }],
  viewing: [
    { value: "all", label: msg("Any") },
    { value: "open-eye", label: msg("Open-eye") },
    { value: "closed-eye", label: msg("Closed-eye") },
  ],
  family: [
    { value: "all", label: msg("Any") },
    { value: "experiential-replication", label: msg("Experiential replications") },
    { value: "visionary-psychedelic-art", label: msg("Visionary psychedelic art") },
    { value: "traditional-cultural-art", label: msg("Traditional cultural art") },
    { value: "dark-surrealism", label: msg("Dark surrealism") },
    { value: "optical-perceptual-art", label: msg("Optical and perceptual art") },
    { value: "generative-abstract-art", label: msg("Generative abstract art") },
    { value: "effect-illustration", label: msg("Effect illustrations") },
    { value: "explanatory-figure", label: msg("Explanatory figures") },
    { value: "uncertain", label: msg("Unclassified content") },
  ],
  artistType: [
    { value: "all", label: msg("Any") },
    { value: "replicator", label: msg("Replicators") },
    { value: "traditional-psychedelic-artist", label: msg("Traditional psychedelic artists") },
  ],
  drug: [{ value: "all", label: msg("Any") }],
  drugClass: [
    { value: "all", label: msg("Any") },
    { value: "psychedelics", label: msg("Psychedelics") },
    { value: "dissociatives", label: msg("Dissociatives") },
    { value: "deliriants", label: msg("Deliriants") },
    { value: "other", label: msg("Other") },
  ],
};

/** The name of each filter axis, as the popover row reads it. */
export const TAXONOMY_FILTER_LABELS: Record<TaxonomyFilterKey, string> = {
  viewing: msg("Viewing mode"),
  artistType: msg("Artist practice"),
  effect: msg("Depicted effect"),
  drug: msg("Drug"),
  drugClass: msg("Drug class"),
  family: msg("Content family"),
};

/**
 * Chip prefixes stay self-contained: a bare "Drug class: Psychedelics" must
 * not read as a depicted-effect chip once the popover's group heading (which
 * carries the "named in the title" meaning) is out of sight.
 */
export const TAXONOMY_FILTER_CHIP_LABELS: Record<TaxonomyFilterKey, string> = {
  ...TAXONOMY_FILTER_LABELS,
  drug: msg("Drug in title"),
  drugClass: msg("Drug class in title"),
};

/**
 * Media type is a filter like any other. It stays outside
 * `GalleryTaxonomyFilterState` because that state is the *taxonomy*, tags an
 * editor assigns, while media type is a property of the stored file, and the
 * URL has always carried it as `?type=`.
 */
export const MEDIA_OPTIONS: ReadonlyArray<TaxonomyFilterOption> = [
  { value: "all", label: msg("All media") },
  { value: "image", label: msg("Images") },
  { value: "video", label: msg("Videos") },
  { value: "audio", label: msg("Audio") },
];

export const MEDIA_LABEL = msg("Media");

/**
 * Every reader-facing replication term, flat, for the glossary drafter. The
 * "Any" placeholder is a control word, not vocabulary, so it is left out.
 */
export const REPLICATION_VOCABULARY: readonly string[] = [
  ...REPLICATION_NOUNS,
  APPROVED_REPLICATOR_LABEL,
  VERIFIED_REPLICATOR_LABEL,
  UNATTRIBUTED_LABEL,
  ARTIST_LABEL,
  ARTISTS_LABEL,
  ...Object.values(TAXONOMY_FILTER_LABELS),
  ...Object.values(TAXONOMY_FILTER_CHIP_LABELS),
  ...Object.values(TAXONOMY_FILTER_OPTIONS).flatMap((options) => options.map(({ label }) => label)),
  MEDIA_LABEL,
  ...MEDIA_OPTIONS.map(({ label }) => label),
].filter((label) => label !== "Any");
