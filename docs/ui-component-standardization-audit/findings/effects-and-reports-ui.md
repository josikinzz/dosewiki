# Effects And Reports UI Standardization Audit

## Skills read

- impeccable extract: `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Scope

Audit lane: `src/features/effects`, `src/features/reports`, `src/app/effects`, `src/app/effect`, `src/app/reports`, and public-route bridge components under `src/app/_components/public-routes`.

Goal: identify reusable components and patterns to standardize effect pages, report pages, galleries, hero sections, contributor/citation sections, cards, timelines, placeholders, and related-substance surfaces. No implementation performed.

## High-level finding

The lane already has a useful primitive layer, but the primitives are split by history rather than by UI intent:

- Effect articles and substance bridge sections use `ArticleSection` / `ArticleSubsectionCard` from `src/components/common/ArticleSection.tsx`.
- Trip report detail sections use `SectionCard` from `src/components/common/SectionCard.tsx`.
- Report cards use raw `surfaceVariants` / `interactiveSurfaceVariants` from `src/components/ui/surface.tsx`.
- Effect index cards use `IndexCard` from `src/components/common/IndexCard.tsx`.

The best extraction path is not a brand-new visual system. It is a small set of cross-lane public-content components that wrap these existing primitives and make the repeated shapes explicit.

## Extraction candidates

### 1. Public detail hero

Current duplicated shapes:

- `src/features/effects/components/EffectHero.tsx:37` renders a custom `theme-article-hero` section with title, icon badge, creator attribution, summary, and tags.
- `src/features/reports/components/ReportHeroSection.tsx:27` uses `Surface variant="articleHero"` with title, author/date metadata, featured badge, tags, and avatar.
- `src/features/effects/pages/EffectArticlePage.tsx:80` currently renders a much smaller title row instead of using `EffectHero`, so effect detail routes have two competing hero patterns.

Extraction candidate: `PublicDetailHero`.

Suggested variants:

- `kind="effect"`: icon badge, SEI creator attribution pill, optional summary, tag chips.
- `kind="report"`: author/date metadata row, optional avatar/profile link, optional featured badge, tag chips.
- Shared slots: `title`, `icon`, `metadata`, `badges`, `tags`, `summary`, `media`.

Migration path:

1. Normalize `EffectHero` onto `Surface variant="articleHero"` so it shares the report hero shell.
2. Replace the title-only block in `EffectArticlePage` with the normalized hero model, or explicitly remove the unused `EffectHero` if the article model cannot provide summary/tags.
3. Move the shared tag chip and featured badge markup into hero subcomponents before changing layout.

Risk: moderate. Hero changes are visually prominent. Keep the initial extraction structural only and preserve class names.

### 2. Public section shell

Current duplicated shapes:

- `src/features/effects/pages/EffectArticlePage.tsx:43` wraps rich effect content in `ArticleSection`.
- `src/app/_components/public-routes/EffectReplicationsSection.tsx:11` wraps fetched replications in `ArticleSection` plus `ArticleSubsectionCard`.
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx:22` uses the same section primitive for loading state.
- `src/features/reports/pages/TripReportDetailPage.tsx:65` wraps report sections in plain `div id=...` containers, while the actual card shell lives inside each component.
- `src/features/reports/components/TextSection.tsx:25`, `SubjectInfoCard.tsx:39`, `SubstancesCard.tsx:25`, and `TimelineSection.tsx:64` repeat section heading composition with `IconBadge`.

Extraction candidate: `PublicContentSection`.

Suggested variants:

- `layout="article"`: header outside content, matching `ArticleSection`.
- `layout="card"`: header and content inside a `Surface`/`SectionCard`, matching trip report sections.
- `layout="plain"`: scroll target plus content only, for overview prose.
- `spacing="article" | "effect" | "report" | "none"`.

Migration path:

1. Add a shared section header helper that accepts `title`, `icon`, `id`, `tone`, and optional `actions`.
2. Refactor report `TextSection`, `SubjectInfoCard`, and `SubstancesCard` to consume that helper while keeping `SectionCard`.
3. Add a `report` spacing variant to the same section model only after the report pages are using the shared header consistently.
4. Move bridge fallbacks onto the same loading/empty section API.

Risk: low to moderate. This is mostly composition. Avoid changing scroll target IDs because `PublicTableOfContents` depends on them in `TripReportDetailPage.tsx:36`.

### 3. Media gallery and media tile

Current reusable pieces:

- `src/features/effects/components/ReplicationGallery.tsx:53` sorts media, builds lightbox slides, renders square image/video tiles, and configures lightbox controls.
- `src/features/effects/pages/EffectArticlePage.tsx:127` renders audio replication cards inline with `ArticleSubsectionCard`.
- `src/features/effects/components/ReplicationsPlaceholder.tsx:8` defines a separate dashed placeholder that is not used by the bridge fallback.
- `src/app/_components/public-routes/EffectReplicationsSection.tsx:24` uses a plain text loading card instead of the placeholder language.

Extraction candidate: `PublicMediaGallery` plus `MediaTile`.

Suggested variants:

- `mediaType="image" | "video" | "audio"`.
- `presentation="grid" | "compact-list"`.
- `emptyState="none" | "placeholder" | "loading"`.
- Shared metadata fields: `title`, `creator`, `thumbnailUrl`, `resourceUrl`, `width`, `height`, `format`.

Migration path:

1. Extract the replication tile body from `ReplicationGallery` without changing lightbox behavior.
2. Reuse the same tile metadata model for the audio replication branch in `EffectArticlePage`.
3. Replace `ReplicationsPlaceholder` and the route fallback text with one `MediaPlaceholder` variant.

Risk: moderate. Lightbox behavior and video MIME handling in `ReplicationGallery.tsx:10` are real behavior, so keep that code local until the tile API is stable.

### 4. Report cards, compact report cards, and related report surfaces

Current duplicated shapes:

- `src/features/reports/components/ReportCard.tsx:22` builds a full list card from raw surface variants.
- `src/features/article/components/sections/TripReportsSection.tsx:110` defines a private `CompactReportCard` for substance article related reports.
- Both card types render title, author avatar/link, trip date, featured state, and navigation to `publicHref.report`.

Extraction candidate: `TripReportCard`.

Suggested variants:

- `density="full"` for `/reports` listing.
- `density="compact"` for substance article related reports.
- `showSubstances=true | false`.
- `showFeatured="badge" | "icon" | false`.
- `fromSubstanceSlug` support should remain in the href builder.

Migration path:

1. Move shared model projection into a small helper: title, author, avatar, date, featured, href.
2. Convert `CompactReportCard` to use the helper but keep its `ArticleSubsectionCard` shell.
3. Convert `ReportCard` to use the helper and then consider a shared `TripReportCard` shell.

Risk: low. The compact and full layouts can remain separate variants while sharing projection and badges.

### 5. Fact tile and metadata list

Current duplicated shapes:

- `src/features/reports/components/SubjectInfoCard.tsx:49` maps configured subject fields into icon-labelled tiles.
- `src/features/reports/components/SubstancesCard.tsx:33` renders substance tiles with dose/ROA metadata.
- `src/features/reports/components/ReportCard.tsx:56` renders compact substance chips inside a report card.
- `src/features/effects/components/RelatedSubstancesSection.tsx:29` delegates related substances to `CategoryGrid`, but its count/intro line is a separate pattern.

Extraction candidate: `PublicFactTile` and `PublicMetadataList`.

Suggested variants:

- `tone="default" | "accent" | "phase-onset" | "phase-peak" | "phase-offset"`.
- `label`, `icon`, `value`, `meta`, `href`, and optional `children`.
- `layout="grid" | "stack" | "inline"`.

Migration path:

1. Extract a tile from `SubjectInfoCard` and `SubstancesCard` because they already share `theme-public-card-subtle rounded-xl border p-*`.
2. Keep `CategoryGrid` intact; only standardize the section intro/count wrapper around related substances.
3. Later, allow `ReportCard` to use the compact inline variant for substance chips.

Risk: low. This mostly deduplicates class names and icon-label structure.

### 6. Timeline section and phase tokens

Current shape:

- `src/features/reports/components/TimelineSection.tsx:11` defines phase-specific icons, borders, backgrounds, time colors, and dot colors.
- Entries render a repeated card-with-dot pattern at `src/features/reports/components/TimelineSection.tsx:70`.

Extraction candidate: `PublicTimeline`.

Suggested variants:

- `phase="onset" | "peak" | "offset"` as current report-specific presets.
- Generic item API: `time`, `title`, `description`, `icon`.
- Tone token object should replace raw Tailwind color strings in `PHASE_CONFIG`.

Migration path:

1. Extract only the entry renderer first, keeping `TimelineSection` as the report-specific owner of phase labels.
2. Move `PHASE_CONFIG` to a token/helper file only if another timeline-like surface appears.
3. Preserve current colors during extraction; do not redesign phase tones as part of componentization.

Risk: low. The main behavioral concern is whitespace preservation via `whitespace-pre-line` in `TimelineSection.tsx:99`.

### 7. Citation, contributor, and related-link sections

Current shapes:

- `src/features/effects/components/EffectCitationsSection.tsx:43` combines see-also links, external links, references, `CitationListItem`, and `ExpandButton`.
- `src/features/effects/components/EffectContributorsSection.tsx:22` renders compact inline contributor links.
- `src/features/effects/pages/EffectArticlePage.tsx:259` renders contributors outside `ArticleSection`, unlike sources and related substances.

Extraction candidate: `PublicAttributionSection`.

Suggested variants:

- `type="contributors"`: inline icon + label + contributor links.
- `type="related-links"`: inline dotted links, currently see-also.
- `type="citations"`: numbered citation list with collapsed references.

Migration path:

1. Extract the inline dotted-link list used by contributors and see-also.
2. Wrap contributors in a consistent section/footer primitive so its scroll target and spacing match sources.
3. Leave citation projection in `projectEffectCitations`; only standardize the rendered shells and subsection labels.

Risk: moderate. Citation rendering has tests in `src/features/effects/components/EffectCitationsSection.test.tsx`; keep projection and numbering untouched.

### 8. Explorer tabs and masonry columns

Current duplicated shapes:

- `src/features/effects/pages/EffectsIndexExplorer.tsx:83` renders tab triggers with icon, label, active styles, and responsive wrapping.
- `src/features/reports/pages/TripReportsExplorer.tsx:47` renders a near-identical tab list, with an extra sort arrow.
- `EffectsIndexExplorer` also owns responsive column distribution for index cards at `src/features/effects/pages/EffectsIndexExplorer.tsx:100` and `:130`.

Extraction candidate: `PublicSegmentedTabs` and `ResponsiveMasonryColumns`.

Suggested variants:

- Tab item: `id`, `label`, `icon`, optional `suffix`, optional `onRepeatClick`.
- Masonry columns: `items`, `columnCount`, optional `getPreferredColumn`.

Migration path:

1. Extract the tab trigger class composition first; both explorers can keep their state logic.
2. Extract the repeated column rendering loop from `EffectsIndexExplorer` only after the card item types are stable.
3. Do not force report grouping into masonry; reports are intentionally linear grouped lists.

Risk: low. This is mostly duplicated UI chrome.

## Existing primitives to keep

- Keep `Surface` and `InteractiveSurface` as the low-level surface layer. They already centralize `articleHero`, `public`, `subtle`, `index`, and focus/hover variants.
- Keep `ArticleSection` and `ArticleSubsectionCard` as the article-lane primitive unless `PublicContentSection` fully subsumes them later.
- Keep `IndexCard` for index category cards. `EffectCategoryCard` and `ParentCategoryCard` are thin enough and already standardized through it.
- Keep `CategoryGrid` for related-substance grouping. Standardize the wrapper/intro, not the grid internals.

## Suggested migration order

1. Extract tiny shared subcomponents with little visual risk: tag chips, featured badge, inline dotted-link list, section heading helper.
2. Normalize report detail cards and effect article sections around one section-header API.
3. Consolidate trip report full/compact cards through a shared projection helper, then a shared card component.
4. Normalize effect and report heroes onto `Surface variant="articleHero"`.
5. Extract media tile/gallery placeholders after hero and section shells are stable.
6. Consider `PublicTimeline` only after the report section shell is standardized.

## Test and review notes

- Hero and card migrations should get visual review on `/effects/[effectSlug]`, `/reports`, `/reports/[slug]`, and a substance page with bridge sections.
- Preserve scroll IDs used by `PublicTableOfContents` in `TripReportDetailPage.tsx`.
- For citation changes, run the focused effect citations test before broad UI tests.
- For report card changes, cover both list cards and substance-related compact report cards because they share data but differ in nesting/link behavior.
