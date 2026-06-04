# Public Pages And Chrome Component Standardization Findings

## Skills read

- impeccable extract: `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Scope

Audited public directory, index, search, profile, and static page surfaces in:

- `src/components/pages`
- `src/components/layout`
- `src/app/_components`
- `src/app/about`
- `src/app/search`
- `src/app/category`
- `src/app/substances`
- `src/app/interactions`
- contributor profile route: `src/app/contributors/[profileKey]/page.tsx`

No implementation changes were made.

## Existing reusable surface area

- Page chrome is split cleanly between Next adapters and reusable layout components: `src/app/_components/RouteChrome.tsx` resolves the route model and renders `Header`/`Footer`, while `src/components/layout/Header.tsx` and `src/components/layout/Footer.tsx` own the visual chrome.
- `PageHeader` already centralizes the dominant public-page title treatment, icon option, spotlight, and lead text at `src/components/layout/PageHeader.tsx:4`.
- `SectionCard` wraps the public card surface and animation delay token at `src/components/common/SectionCard.tsx:5`.
- `StateCard` wraps empty and status-like in-page feedback with badge, icon, actions, footer, alignment, and compact variants at `src/components/common/StateCard.tsx:10`.
- `Surface`, `InteractiveSurface`, and `EmptyStateSurface` already define several reusable surface and interaction variants at `src/components/ui/surface.tsx:11`.
- Route loading pages already funnel through a route loading model and skeleton renderer in `src/app/_components/RouteLoading.tsx:1`; `src/app/category/[categoryKey]/loading.tsx`, `src/app/search/[query]/loading.tsx`, `src/app/loading.tsx`, and `src/app/[slug]/loading.tsx` are thin wrappers.
- Status pages have a reusable full-page shell and fact block in `src/app/_components/StatusPageShell.tsx:10`.

## Extraction opportunities

### Page shell and content width tokens

Repeated page wrappers encode the same container contract inline:

- `src/components/pages/SearchResultsPage.tsx:76` uses `mx-auto w-full max-w-4xl px-4 pb-20 pt-12`.
- `src/components/pages/CategoryPage.tsx:222` uses the same `max-w-4xl px-4 pb-20 pt-12`.
- `src/components/pages/ClassificationDetailPage.tsx:36` repeats the same directory/detail wrapper.
- `src/components/pages/AboutPage.tsx:27` and `src/components/pages/UserProfilePage.tsx:58` add `main id="main-content"` plus `theme-page-shell min-h-screen focus:outline-none`, then use `max-w-4xl px-4 pb-24 pt-12 md:px-8`.
- `src/components/pages/MechanismDetailPage.tsx:32` uses the same family with `max-w-6xl`.

Migration task: introduce a `PublicPageShell` or `PublicContentShell` with width variants such as `narrow`, `standard`, and `wide`, plus optional `as="main"` and `focusTarget` support. This should own `id="main-content"`, focus styling, horizontal padding, top padding, and bottom padding. Start with About/Profile/Search/Category/Classification, then Mechanism.

### Secondary section headers

About and profile pages repeat an icon-heading-divider row:

- `src/components/pages/AboutPage.tsx:62`, `src/components/pages/AboutPage.tsx:79`, and `src/components/pages/AboutPage.tsx:94` each build a section header with a fuchsia icon/title and trailing gradient divider.
- `src/components/pages/UserProfilePage.tsx:95` repeats the same pattern for the profile bio section.
- Card-local headers use a closely related but incompatible pattern in `src/components/pages/CategoryPage.tsx:131`, `src/components/pages/CategoryPage.tsx:173`, `src/components/pages/CategoryPage.tsx:240`, `src/components/pages/ClassificationDetailPage.tsx:39`, and `src/components/pages/UserProfileExpandableSections.tsx:54`.

Migration task: extract `PublicSectionHeading` with variants:

- `rule`: icon + title + trailing divider for unframed content sections.
- `card`: compact icon/title row for use inside `SectionCard`.
- `action`: button-compatible heading row for expandable sections.

This removes duplicated fuchsia icon sizing, title weights, divider gradients, and card heading spacing.

### Contributor avatar and person card

Profile and about pages implement overlapping avatar/person treatments inline:

- About founder cards create initials with `toInitials`, avatar fallback, border/ring styles, hover scale, username text, and arrow affordance at `src/components/pages/AboutPage.tsx:105`.
- Profile hero avatar repeats avatar/fallback branching, glow, border, ring, hover scale, and initials logic at `src/components/pages/UserProfilePage.tsx:17`.
- Profile links are inline pill buttons at `src/components/pages/UserProfilePage.tsx:73`, using the same icon + label + optional external affordance pattern that appears elsewhere as chip-like navigation.

Migration task: extract:

- `ContributorAvatar` with `size="sm" | "lg"`, image/fallback support, and optional glow.
- `ContributorCard` for list rows on About and future contributor indexes.
- `ExternalProfileLink` or a generalized `IconPillLink` for profile links and similar public chip links.

This also standardizes initials generation, avatar alt text, hover scale, and ring colors.

### Public list/detail grouped layouts

Category and classification pages duplicate grouped substance-list structure:

- `src/components/pages/CategoryPage.tsx:239` renders `SectionCard`, `IconBadge`, heading, list, `Button variant="listItem"`, and empty copy.
- `src/components/pages/ClassificationDetailPage.tsx:38` renders the same structure for a single group.
- `src/components/pages/MechanismDetailPage.tsx:83` uses `Surface variant="muted"` plus `CategoryGrid`, creating a visually different detail-list card for a closely related public taxonomy page.
- `src/components/pages/DosagesPage.tsx:85` feeds the same `CategoryGrid` pattern into the substance index.

Migration task: extract a `PublicGroupedSubstanceList` or `TaxonomyGroupSection` that accepts icon, label, groups/items, item href builder, empty message, and display mode (`list` or `grid`). Migrate Category and Classification first because they are nearly identical; then evaluate whether Mechanism can share the same section wrapper while keeping its qualifier-specific `CategoryGrid`.

### Search result rows and metadata chips

Search results have a reusable row/card shape that is currently local:

- Empty search already uses `StateCard` at `src/components/pages/SearchResultsPage.tsx:87`.
- Result rows combine `Button variant="card"`, `interactiveSurfaceVariants({ variant: "result" })`, type overline, best-match badge, highlighted title/secondary text, metadata badges, and trailing action label at `src/components/pages/SearchResultsPage.tsx:116`.
- The overline and token chip treatment (`tracking-[0.28em]`, `Badge` plus `HighlightedText`) is likely reusable for future index and filter results.

Migration task: extract `SearchResultCard` and `SearchMetaChips`, keeping `HighlightedText` support as props. Add a small typography token for public overline labels instead of hard-coding `text-xs uppercase tracking-[0.28em]`.

### Filters, tabs, and chip navigation

There is no single filter/search surface primitive even though related controls exist:

- Header search fallback is a bespoke rounded skeleton in `src/components/layout/Header.tsx:13`.
- Mechanism qualifier navigation uses `badgeVariants({ variant: "effectInteractive" })` with ad hoc active overrides at `src/components/pages/MechanismDetailPage.tsx:43`.
- Profile external links use hand-coded pill links at `src/components/pages/UserProfilePage.tsx:73`.
- Button variants include pill, chip, tab, and list item states in `src/components/ui/button.tsx`, but public pages still combine badge/button/link patterns directly.

Migration task: extract `PublicChipNav` or `FilterPillGroup` with active, count, href, and icon options. Use it first for mechanism qualifiers, then for any search/index filter surfaces. Keep it backed by existing `Button`/`Badge` tokens rather than adding another visual system.

### Loading states

Route loading is model-driven, but skeleton visual tokens are local to `RouteLoading`:

- `SkeletonPulse` and `SkeletonSection` live only in `src/app/_components/RouteLoading.tsx:13`.
- Skeleton cards use inline `rounded-2xl border border-white/10 bg-white/[0.03] p-5` at `src/app/_components/RouteLoading.tsx:26`.
- `EffectReplicationsSectionFallback` renders plain text `Loading replications…` in a nested article card at `src/app/_components/public-routes/EffectReplicationsSection.tsx:27`, while `SubstanceTripReportsSectionFallback` uses `RouteLoadingSkeleton` at `src/app/_components/public-routes/SubstanceTripReportsSection.tsx:21`.

Migration task: promote `SkeletonPulse`, `SkeletonSection`, and a `PublicSkeletonSurface` into a shared component, then update article-section fallbacks to use the same skeleton vocabulary. This would align route-level and section-level loading states.

### Status and empty-state shell convergence

There are two related feedback systems:

- `StateCard` handles in-page empty states at `src/components/common/StateCard.tsx:10`.
- `StatusPageShell` handles full-page statuses at `src/app/_components/StatusPageShell.tsx:10`.
- `StatusFact` repeats an overline label token at `src/app/_components/StatusPageShell.tsx:108`, and `RouteLoading` repeats a similar loading label token at `src/app/_components/RouteLoading.tsx:46`.

Migration task: keep both shells, but extract shared `StatusHeader`, `StatusActions`, `StatusFact`, and `PublicOverline` tokens. This preserves different layout needs while standardizing badge/title/description/label typography.

### Surface tokens and fuchsia hard-coding

Existing theme classes are useful, but scoped pages still hard-code fuchsia, white opacity, radii, shadows, and divider gradients:

- Header nav focus and rings use `focus-visible:outline-fuchsia-400` and `ring-[color:var(--theme-card-border)]` inline at `src/components/layout/Header.tsx:116` and `src/components/layout/Header.tsx:179`.
- About section dividers hard-code `from-fuchsia-500/30 via-fuchsia-500/10` at `src/components/pages/AboutPage.tsx:70`.
- User profile avatar glows and fallback gradient are fuchsia/violet/sky-specific at `src/components/pages/UserProfilePage.tsx:21` and `src/components/pages/UserProfilePage.tsx:46`.
- Contributor cards hard-code `rounded-2xl border border-white/10 bg-white/[0.02]` at `src/components/pages/AboutPage.tsx:115`.
- Skeleton and status facts repeat rounded surface values at `src/app/_components/RouteLoading.tsx:30` and `src/app/_components/StatusPageShell.tsx:110`.

Migration task: add semantic public tokens/variants for:

- `public.sectionRule`
- `public.avatarGlow`
- `public.avatarRing`
- `public.personCard`
- `public.skeletonSurface`
- `public.overline`
- `public.inlineEmptySurface`

Prefer extending `Surface`, `Button`, and `Badge` variants before adding new one-off CSS classes.

## Inconsistencies to address

- About and profile pages bypass `PageHeader`, creating different hero spacing, title scale, and icon/logo treatment than Search, Category, Classification, Mechanism, and Substances.
- Similar taxonomy pages use different wrappers: Category and Classification use `SectionCard`; Mechanism uses `Surface variant="muted"` with a custom shadow.
- Empty states are inconsistent: Search and profile trip reports use `StateCard`, Category and Classification use plain text inside a card, About uses a dashed custom empty panel.
- Loading states are inconsistent between route fallbacks and article-section fallbacks.
- Public section headings vary between `text-lg font-semibold text-fuchsia-300`, `text-xl font-bold text-white`, and `text-2xl font-bold tracking-tight text-fuchsia-300` without a semantic component boundary.
- Chip-like links are implemented as `Badge`, `Button`, and raw anchors depending on page, which makes active/hover/focus behavior drift.

## Suggested migration order

1. Add `PublicPageShell` and migrate Search, Category, Classification, About, and UserProfile wrappers.
2. Add `PublicSectionHeading` and migrate About, UserProfile bio, UserProfile expandable sections, Category card headers, and Classification card header.
3. Add `ContributorAvatar` and `ContributorCard`; migrate About founder cards and UserProfile hero avatar.
4. Add `TaxonomyGroupSection` for Category and Classification list cards.
5. Add `SearchResultCard` and `SearchMetaChips` for `SearchResultsPage`.
6. Add `PublicChipNav` for Mechanism qualifier navigation and future filter/search surfaces.
7. Promote skeleton primitives out of `RouteLoading` and align article-section fallbacks.
8. Extract semantic token variants into `Surface`, `Button`, and `Badge` before deleting duplicated inline classes.

## Guardrails

- Preserve current route-model ownership in `src/app/_components/RouteChrome.tsx`; the extraction should not move navigation policy into visual components.
- Keep component APIs data-shaped, not route-shaped: accept labels, icons, counts, hrefs, and children rather than importing public route builders into primitives.
- Avoid broad visual redesign during extraction. The first pass should make existing patterns reusable and testable, then later design passes can adjust aesthetics.
- Do not introduce a second surface system parallel to `Surface`, `Button`, and `Badge`; extend those primitives where possible.
