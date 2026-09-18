# Replications Becomes a Top-Level Section

**Status:** Accepted; implemented.
**Current implementation:** `src/config/siteFlavor.ts` orders the dose.wiki primary nav as Substances · Effects · Reports · Replications, with About secondary; Effect Index remains Effects · Replications · Reports, with About secondary. `src/features/effects/pages/EffectsIndexExplorer.tsx` migrates `/effects#gallery` to `/replications`, covered by `src/features/effects/pages/EffectsIndexExplorer.test.tsx`.

The replication gallery moves out of the Subjective Effect Index (where it was the `#gallery` tab on `/effects`) and becomes the default view of a top-level `/replications` section with tabs (Gallery, Tutorials, Audio, plus an external r/replications link). dose.wiki's homepage quick links and sticky header gain Replications in position four (Substances · Effects · Reports · Replications · About); Effect Index's preserved original nav order is untouched, though the shared `/replications` page restructure and the new `hugeicons:ai-image` route-chrome icon apply to both flavors. Gallery focus views ("see all X" by artist or effect) get canonical path routes (`/replications/artist/<key>`, `/replications/effect/<slug>`) with query parameters reserved for transient filters.

We chose path routes for focus views over query-params-for-everything (cleaner shareable links won over the one-page purity argument, accepting that effect-focus pages coexist with effect articles' own replication sections) and over keeping the gallery inside the SEI (which buried the corpus one fragment deep and left its views unaddressable). The old `/effects#gallery` fragment redirects to `/replications` on both flavors so circulated links never dead-end.

**Consequences**

- The SEI on `/effects` loses its Gallery tab on both flavors — deliberate, despite the Effect Index preservation guardrail; the guardrail continues to protect EI's header/homepage nav order, not the gallery's address.
- `/replications/artist/<key>` and `/replications/effect/<slug>` become public URL surface alongside the existing `/replications/<slug>` permalinks; artist focus pages remain gallery views (linking to contributor profiles when the artist is a known contributor), never redirects.
- The per-substance replication showcase inside substance articles (see the substance-gallery curation plan) is a separate surface with its own database-backed curation; it is unaffected by this section's structure.
