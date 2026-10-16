import type { GalleryTaxonomyFilterState } from "@/features/effects/gallery/galleryTypes";
import { msg } from "@/i18n/messages";

const REPLICATION_NOUNS = [
  msg("Replication"),
  msg("Replications"),
  msg("Replicator"),
  msg("Replicators"),
  msg("Replicates"),
] as const;

export const APPROVED_REPLICATOR_LABEL = msg("Approved replicator");
export const VERIFIED_REPLICATOR_LABEL = msg("Verified replicator");
export const UNATTRIBUTED_LABEL = msg("Unattributed");

export const ARTIST_LABEL = msg("Artist");
export const ARTISTS_LABEL = msg("Artists");

export type TaxonomyFilterKey = keyof GalleryTaxonomyFilterState;
export type TaxonomyFilterOption = { value: string; label: string };

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

export const TAXONOMY_FILTER_LABELS: Record<TaxonomyFilterKey, string> = {
  viewing: msg("Viewing mode"),
  artistType: msg("Artist practice"),
  effect: msg("Depicted effect"),
  drug: msg("Drug"),
  drugClass: msg("Drug class"),
  family: msg("Content family"),
};

export const TAXONOMY_FILTER_CHIP_LABELS: Record<TaxonomyFilterKey, string> = {
  ...TAXONOMY_FILTER_LABELS,
  drug: msg("Drug in title"),
  drugClass: msg("Drug class in title"),
};

export const MEDIA_OPTIONS: ReadonlyArray<TaxonomyFilterOption> = [
  { value: "all", label: msg("All media") },
  { value: "image", label: msg("Images") },
  { value: "video", label: msg("Videos") },
  { value: "audio", label: msg("Audio") },
];

export const MEDIA_LABEL = msg("Media");

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
