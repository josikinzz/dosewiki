# Article/Substance UI Component Standardization Audit

## Skills read

- impeccable extract — `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Scope

Audited the public article/substance UI lane:

- `src/features/article/components`
- `src/features/article/pages`
- `src/app/[slug]`
- `src/app/chemical`
- `src/app/psychoactive`
- Public citation rendering where it affects article UI consistency

This is a findings-only pass. No implementation was performed.

## Executive summary

The article page already has the beginning of a good component system in `ArticleSection`, `ArticleSubsectionCard`, and `ArticleSubsectionHeader` (`src/components/common/ArticleSection.tsx:12-157`). The main problem is that newer sections use these primitives while older or more specialized sections still hand-roll equivalent shells, subheaders, badges, source footers, expandable previews, and async states.

The strongest standardization candidates are:

1. `ArticleSection`/source-section shell consolidation.
2. Reusable metadata/stat/card primitives for article subsection cards.
3. A unified badge/status-pill system.
4. A shared expandable-list/preview controller.
5. Shared citation marker and citation-list styling.
6. Shared source-attribution footer.
7. Shared loading/empty section states.

Each of these has at least three repeated intents across the scoped files.

## Existing primitives to keep

`ArticleSection`, `ArticleSubsectionCard`, and `ArticleSubsectionHeader` are the right base layer:

- Section spacing and scroll anchoring are centralized in `ArticleSection` (`src/components/common/ArticleSection.tsx:12-51`).
- Card variants already encode subtle/nested/interactive intent (`src/components/common/ArticleSection.tsx:54-107`).
- Subsection headers already encode icon plus heading structure (`src/components/common/ArticleSection.tsx:109-157`).

Recommendation: extend these instead of creating a parallel article design system.

## Extraction candidates

### 1. Article section shell and source section shell

Repeated intent: public page sections with an icon heading, stable spacing, scroll anchor, and optional nested groups.

Current variants:

- `ArticleLayout` adds a custom `DeferredSection` wrapper for most later sections (`src/features/article/components/ArticleLayout.tsx:29-35`, `src/features/article/components/ArticleLayout.tsx:70-101`).
- Most body sections use `ArticleSection`, for example tolerance (`src/features/article/components/sections/ToleranceSection.tsx:42-88`) and pharmacology (`src/features/article/components/sections/PharmacologySection.tsx:117-122`).
- `CitationsSection` hand-rolls a div shell with the same `pt-12 scroll-mt-6` spacing and uses `SectionHeader` directly (`src/features/article/components/sections/CitationsSection.tsx:53-97`).
- `LegalitySection` and `PharmacologySection` still hand-roll h3 subsection header markup in places (`src/features/article/components/sections/LegalitySection.tsx:170-192`, `src/features/article/components/sections/PharmacologySection.tsx:123-130`, `src/features/article/components/sections/PharmacologySection.tsx:239-246`).

Candidate API:

```tsx
<ArticleSection id icon heading bleed="standard|none">
  <ArticleSection.Group icon heading headingLevel="h3">
    ...
  </ArticleSection.Group>
</ArticleSection>
```

Migration path:

1. Move `DeferredSection` intent into `ArticleSection` or `ArticleLayout` as a named `ArticleSectionBleed` primitive.
2. Convert `CitationsSection` to `ArticleSection` with a `kind="sources"` or `spacing="article"` variant.
3. Replace local h3 header blocks in legality/pharmacology/interactions with `ArticleSubsectionHeader`.

### 2. Article subsection card, metadata row, and compact metric card

Repeated intent: card-like blocks that show a label/icon, small body text, and optional structured values.

Current variants:

- Tolerance cards use `ArticleSubsectionCard` but hand-roll the icon label row (`src/features/article/components/sections/ToleranceSection.tsx:53-66`, `src/features/article/components/sections/ToleranceSection.tsx:71-85`).
- Subjective effects cards use `ArticleSubsectionCard` plus `ArticleSubsectionHeader` consistently (`src/features/article/components/sections/SubjectiveEffectsSection.tsx:98-124`, `src/features/article/components/sections/SubjectiveEffectsSection.tsx:128-153`, `src/features/article/components/sections/SubjectiveEffectsSection.tsx:190-215`).
- Legality country cards use `ArticleSubsectionCard` with flag, country, status badge, clipped text, and expand control (`src/features/article/components/sections/LegalitySection.tsx:216-259`).
- Pharmacology receptor/metabolite panels use an `ArticleSubsectionCard`, but the rows inside are bespoke zebra rows (`src/features/article/components/sections/PharmacologySection.tsx:148-221`).
- Interactions category panels are card-equivalents but do not use `ArticleSubsectionCard` (`src/features/article/components/sections/InteractionsSection.tsx:217-240`).

Candidate API:

```tsx
<ArticleInfoCard tone="neutral|danger|warning|success" icon title accessory>
  <ArticleBodyText cited>{text}</ArticleBodyText>
</ArticleInfoCard>

<ArticleKeyValueRows rows={[...]} density="compact" />
```

Migration path:

1. Add an `ArticleInfoCard` wrapper around `ArticleSubsectionCard` that accepts `icon`, `title`, `tone`, `accessory`, and `children`.
2. Migrate tolerance and interaction category panels first; they are simple and have clear repeated structure.
3. Migrate legality cards later because they need flag accessory, clipped preview, status pill, and citation-aware body text.

### 3. Badge, pill, and status tone system

Repeated intent: small inline labels for classifications, categories, statuses, qualifiers, and interaction items.

Current variants:

- Hero classification badges use `badgeVariants({ variant: "ghostPill" })` plus local hover/focus classes (`src/features/article/components/sections/HeroSection.tsx:170-257`).
- Hero index categories use a local `rounded-full bg-white/5 px-2.5 py-1` implementation (`src/features/article/components/sections/HeroSection.tsx:288-314`).
- Legality status pills define an entire local color/status classifier and render local badge markup (`src/features/article/components/sections/LegalitySection.tsx:1-130`, `src/features/article/components/sections/LegalitySection.tsx:232-240`).
- Pharmacology qualifiers use a local fuchsia tiny pill (`src/features/article/components/sections/PharmacologySection.tsx:163-170`).
- Interaction collapsed badges use a local rounded rectangle pill (`src/features/article/components/sections/InteractionsSection.tsx:121-153`).

Candidate API:

```tsx
<ArticlePill tone="neutral|accent|danger|warning|info|success" icon href onSelect size="xs|sm">
  {label}
</ArticlePill>

<ArticleStatusPill status={statusText} cited article={article} />
```

Migration path:

1. Extract tone mapping from `LegalitySection` into a status utility/component.
2. Standardize focus, hover, radius, density, and citation handling in `ArticlePill`.
3. Replace hero category badges, pharmacology qualifier pills, and interaction badges with this primitive.

### 4. Expandable preview/list behavior

Repeated intent: show a collapsed subset or clipped summary, then expand inline with the same `ExpandButton` vocabulary.

Current variants:

- Hero alternative names are limited to five and expanded inline (`src/features/article/components/sections/HeroSection.tsx:131-160`).
- Hero chemistry identifiers expand/collapse as a detail list (`src/features/article/components/sections/HeroSection.tsx:245-285`).
- Reagent results show the first four rows and use a count button (`src/features/article/components/sections/ReagentSection.tsx:254-333`).
- Citations and further reading share one expansion state for multiple lists (`src/features/article/components/sections/CitationsSection.tsx:35-97`).
- Legality cards use a character-count heuristic and max-height clipping (`src/features/article/components/sections/LegalitySection.tsx:209-257`).
- Pharmacology receptor profile and metabolites animate independently with similar `AnimatePresence` blocks (`src/features/article/components/sections/PharmacologySection.tsx:140-235`, `src/features/article/components/sections/PharmacologySection.tsx:254-268`).

Candidate API:

```tsx
<ExpandableList
  items={items}
  collapsedCount={4}
  buttonVariant="count"
  ariaLabelBase="reagent results"
>
  {(visibleItems) => ...}
</ExpandableList>

<ExpandableText maxLines={3} ariaLabelBase="United States legality notes">
  <CitedText ... />
</ExpandableText>
```

Migration path:

1. Start with non-animated count-based lists: hero aliases, reagent results, citations.
2. Add `ExpandableText` for legality notes to replace the character heuristic.
3. Add an optional `motion` variant for pharmacology detail panels after the static behavior is shared.

### 5. Citation UI and cited body text

Repeated intent: citation markers must look and behave identically wherever public article text renders.

Current variants:

- Inline markers are rendered in `CitedText` with fuchsia superscript links and local focus styling (`src/features/article/components/CitedText.tsx:5-16`).
- `CitedText` parses adjacent citation tokens and clusters them (`src/features/article/components/CitedText.tsx:18-47`).
- `CitationMarker` separately maps explicit reference IDs to the same rendering helper (`src/features/article/components/CitedText.tsx:53-75`).
- Citation list sections use `CitationListItem` plus a local `CitationList` wrapper (`src/features/article/components/sections/CitationsSection.tsx:14-33`).
- Cited text appears across hero summary, pharmacology, tolerance, harm potential, interactions, legality, and reagent/section copy.

Candidate API:

```tsx
<ArticleText cited article={article} tone="body|muted|compact">
  {text}
</ArticleText>

<CitationSup label href />
<ArticleCitationList citations={...} />
```

Migration path:

1. Export the citation superscript as a named component rather than a private helper.
2. Introduce `ArticleText` to centralize text color, leading, paragraph spacing, and citation parsing.
3. Convert `CitationsSection`'s local `CitationList` into a reusable article citation-list component.

### 6. Source attribution footer

Repeated intent: compact footer aligned to the right, usually with an external source badge or contributor attribution.

Current variants:

- Reagent testing uses `ExternalSourcePill` inside a right-aligned footer (`src/features/article/components/sections/ReagentSection.tsx:336-343`).
- Interactions uses the same pattern for TripSit (`src/features/article/components/sections/InteractionsSection.tsx:244-251`).
- Subjective effects has a bespoke contributor attribution banner with avatar, contributor link, and external original article link (`src/features/article/components/sections/SubjectiveEffectsSection.tsx:240-260` and following lines).

Candidate API:

```tsx
<ArticleSourceFooter align="end">
  <ExternalSourcePill ... />
</ArticleSourceFooter>

<ArticleContributorAttribution author text url avatarSrc />
```

Migration path:

1. Extract the shared right-aligned spacing/footer wrapper first.
2. Keep `ExternalSourcePill` as the visual unit for external sources.
3. Convert subjective-effects attribution into a richer variant instead of leaving it as one-off markup.

### 7. Loading and empty section states

Repeated intent: sections either suppress themselves when no content exists or show an in-section loading state for async enrichment.

Current variants:

- Page route loading delegates to `RouteLoading` (`src/app/[slug]/loading.tsx:1-5`).
- Most article sections return `null` when empty, for example tolerance (`src/features/article/components/sections/ToleranceSection.tsx:38-40`), pharmacology (`src/features/article/components/sections/PharmacologySection.tsx:110-115`), and citations (`src/features/article/components/sections/CitationsSection.tsx:49-51`).
- Reagent testing shows a local spinner row while fetching external reagent data (`src/features/article/components/sections/ReagentSection.tsx:278-291`).
- Table of contents accounts for reagent external loading when deciding which items are present, but does not expose a visible loading state itself (`src/features/article/components/sections/TableOfContentsSection.tsx:1-45`).

Candidate API:

```tsx
<ArticleSectionState kind="loading|empty|unavailable" icon label />
```

Migration path:

1. Add `ArticleSectionLoading` for reagent-style async states.
2. Keep default empty behavior as `null`, but standardize documented cases where a visible empty state is useful.
3. Make TOC/reagent loading decisions share a small model so TOC presence and section loading cannot drift.

## Priority order

1. Normalize `CitationsSection` and source shells to `ArticleSection`; this reduces visible section-spacing drift with low risk.
2. Extract `ArticlePill`/`ArticleStatusPill`; badges are the most visibly inconsistent repeated pattern.
3. Extract `ExpandableList`/`ExpandableText`; this removes several local collapsed-state heuristics.
4. Add `ArticleInfoCard` and migrate tolerance/interactions before legality.
5. Add `ArticleText`/`CitationSup` after the citation rollout stabilizes, because marker behavior is correctness-sensitive.
6. Standardize source footers and section loading states as opportunistic cleanup.

## Notes for implementation planning

- Preserve the dark article visual language and existing theme tokens. The goal is standardization, not a redesign.
- Avoid adding a new parallel design-system directory for article-only primitives. `src/components/common/ArticleSection.tsx` is already the natural anchor, though it may eventually deserve a folder split.
- Treat citation rendering as behaviorally sensitive. Any `CitedText` extraction needs focused tests around adjacent markers, unknown references, and anchor destinations.
- Avoid broad migration in one PR. Each candidate can be migrated section-by-section while preserving snapshots and focused tests.
