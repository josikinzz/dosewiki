# Shared UI And Tokens Audit

## Skills read

- impeccable extract: `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Scope

Audited the shared design-system lane for the dose.wiki frontend: `src/components/ui`, `src/components/common`, `src/styles.css`, `src/styles/`, `src/theme`, `src/app/fonts.ts`, package UI dependencies, and existing ownership/surface tests. This is a findings-only audit; no implementation changes were made.

## Summary

The repo has a real shared UI foundation: Radix/shadcn-style primitives in `src/components/ui`, presentation helpers in `src/components/common`, a theme manifest in `src/theme/theme-token-interface.json`, semantic theme classes in `src/styles/utilities-theme.css`, typography utilities in `src/styles/utilities-typography.css`, and ownership tests in `src/components/ui/ownership.test.ts`.

The main standardization opportunity is not creating a new design system. It is finishing the extraction that has already started: move repeated card/icon/empty/article-section recipes into a smaller set of owned primitives, make the token interface enforceable, and stop relying on broad light-theme selector shims to reinterpret raw dark Tailwind classes.

Quick repeated-pattern counts from `src/app`, `src/components`, and `src/features` excluding tests:

- `<Button`: 146 uses.
- `<SectionCard`: 40 uses.
- `<ArticleSubsectionCard`: 29 uses.
- `<IconBadge`: 14 uses.
- `<ArticleSubsectionHeader`: 11 uses.
- `<StateCard`: 10 uses.
- `<Surface`: 7 direct uses.
- `<InteractiveSurface`: 4 direct uses.

Top raw styling escapes in the same area:

- `text-white`: 148 occurrences.
- `border-white/10`: 137 occurrences.
- `text-fuchsia-300`: 124 occurrences.
- `text-white/80`: 105 occurrences.
- `bg-white/5`: 100 occurrences.
- `text-white/40`: 92 occurrences.
- `text-white/50`: 90 occurrences.
- `text-fuchsia-200`: 90 occurrences.
- `tracking-[0.3em]`: 18 occurrences.

## P1 Recommendations

### 1. Promote card/surface recipes into a clearer shared surface system

Evidence:

- `src/components/ui/surface.tsx:10` already defines `Surface` variants for `card`, `public`, `subtle`, `index`, `state`, `muted`, `danger`, `articleHero`, and `moleculePanel`.
- `src/components/common/SectionCard.tsx:18` adapts `Surface` into a public section card with `theme-public-card-interactive` and an enter animation.
- `src/components/common/StateCard.tsx:42` adapts `EmptyStateSurface` and adds status-orb, badge, actions, footer, alignment, compact, and loading behavior.
- `src/components/common/ArticleSection.tsx:80` defines a separate `ArticleSubsectionCard` with its own padding and variant tables.
- `src/components/ui/surface.test.tsx:52` explicitly smoke-tests `SectionCard`, `StateCard`, search results, report cards, and harm reduction banner through surface primitives.

Why this matters:

Cards are already the reusable visual language, but ownership is split across `Surface`, `SectionCard`, `StateCard`, `ArticleSubsectionCard`, `Card`, route-owned cards, and feature cards. The same intent appears 3+ times: public content card, nested content card, interactive list/result card, empty/status card, and danger callout.

Recommendation:

- Keep `Surface` as the low-level primitive, but define an explicit recipe layer for stable site patterns: `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, and `DangerCallout` or equivalent names matching local vocabulary.
- Migrate `SectionCard`, `ArticleSubsectionCard`, `HarmReductionBanner`, `ReportCard`, search results, and category/mechanism list cards onto those recipes incrementally.
- Preserve route/feature composition locally; only extract the repeated visual shell and state behavior.
- Add a test that forbids new raw `rounded-[...] bg-white/[...] border-white/... shadow-[...]` card shells in `src/components/pages` and public features once baseline migration starts.

### 2. Convert token audit from report-only to a migration gate with a reviewed baseline

Evidence:

- `src/theme/tokenAudit.ts:26` detects raw white text/background/border, raw fuchsia text, arbitrary white backgrounds, direct theme variables, and negative letter spacing.
- `src/theme/tokenAudit.ts:57` now scans `src/app`, `src/components/common`, `src/components/layout`, `src/components/pages`, `src/components/ui`, and `src/features`.
- `src/theme/index.test.ts:108` says the audit reports styling escapes "without enforcing a clean repo yet."
- `src/theme/index.test.ts:145` already supports failing only on findings absent from a reviewed baseline.
- `src/styles/theme-light-mode.css:1` through `src/styles/theme-light-mode.css:220` contains broad selector shims that reinterpret raw dark classes such as `text-white/*`, `text-fuchsia-*`, `bg-white/*`, `border-white/*`, and slate/fuchsia background classes in light mode.

Why this matters:

The light theme is protected by global override nets because component code can still ship dark-theme implementation classes. The audit machinery exists, but it is not yet blocking regressions.

Recommendation:

- Generate and check in a reviewed baseline for existing token-audit findings.
- Add a package script such as `theme:tokens:check` or fold the baseline check into `npm run test`.
- Start with `src/components/ui`, `src/components/common`, and public route components; allow dev-editor surfaces to lag behind behind an explicit folder exception if necessary.
- Track deletion of `src/styles/theme-light-mode.css` override groups as the success metric, not just reduction of raw classes.

### 3. Standardize text, icon, and badge color through semantic utilities

Evidence:

- `src/theme/theme-token-interface.json:73` lists semantic text classes and `src/theme/theme-token-interface.json:102` exposes Tailwind aliases like `dose.text`, `dose.text-secondary`, `dose.accent`, and `dose.card-border`.
- `src/theme/index.ts:13` exports `THEME_CLASS`, but only a small class set is exposed and consumers still commonly inline raw classes.
- `src/components/common/IconBadge.tsx:12` hardcodes `bg-white/10 ring-white/15`, and `src/components/common/IconBadge.tsx:21` hardcodes `text-white`.
- `src/components/common/ArticleSection.tsx:147` hardcodes `text-fuchsia-200`; `src/components/common/ArticleSection.tsx:150` hardcodes `text-white`.
- `src/components/common/StateCard.tsx:74` hardcodes `text-white` in a shared status/empty-state component.

Why this matters:

These shared components are imported broadly. Any raw color class in them multiplies across the site and forces light-mode overrides to compensate.

Recommendation:

- Add semantic icon/badge classes to `theme-token-interface.json` and `src/styles/utilities-theme.css`: for example `theme-icon-accent`, `theme-icon-muted`, `theme-icon-badge`, and `theme-badge-surface`.
- Replace shared component internals first: `IconBadge`, `ArticleSubsectionHeader`, `StateCard`, `StatusOrb` wrappers, and public list-card adornments.
- Use Tailwind aliases for local one-off composition only when semantic classes are too heavy; avoid direct `var(--theme-...)` outside token implementation files.

### 4. Collapse button variants into primitives plus feature-owned recipes

Evidence:

- `src/components/ui/button.tsx:11` defines a large shared `variant` table with semantic variants, shape variants, list/card/suggestion variants, tab variants, and icon variants.
- `src/components/ui/button.tsx:42` through `src/components/ui/button.tsx:69` includes layout-specific variants such as `listItem`, `card`, `suggestion`, `suggestionActive`, `tabPrimary`, `tabSecondary`, `tagRemove`, `iconSmall`, `iconAction`, `iconClose`, and `iconWarning`.
- `src/components/ui/ownership.test.ts:60` blocks known feature-named variants from coming back, but it does not prevent new generic-looking recipe variants from becoming shared API.

Why this matters:

The old feature-named variants have been removed, but `Button` is still doing too much. Variants like `suggestion`, `tabPrimary`, and `card` encode component recipes, not button primitives.

Recommendation:

- Keep primitive axes in `Button`: tone, emphasis, size, shape, and icon-only.
- Move list/card/suggestion/tab recipes into owning components: search result option, tab trigger wrapper, removable tag button, icon action button.
- Extend `ownership.test.ts` with shape-based checks: forbid `Button` variants named after composed UI patterns (`card`, `suggestion`, `tab*`, `listItem`) unless explicitly allowlisted during migration.

## P2 Recommendations

### 5. Extract article subsection primitives into the UI/common boundary deliberately

Evidence:

- `ArticleSubsectionCard` appears 29 times and `ArticleSubsectionHeader` appears 11 times.
- They are currently exported from `src/components/common/ArticleSection.tsx:54` through `src/components/common/ArticleSection.tsx:157`, alongside the higher-level `ArticleSection`.
- Article sections and effect pages use them across multiple domains: harm potential, pharmacology, subjective effects, tolerance, legality, effect articles, and public-route effect replication sections.

Why this matters:

This is a successful extraction candidate by the 3+ use rule, but it is currently hidden inside `ArticleSection.tsx`. It is reusable beyond a single article section and should have an explicit owner.

Recommendation:

- Split `ArticleSubsectionCard` and `ArticleSubsectionHeader` into either `src/components/common/article-section-primitives.tsx` or a small `src/features/article/components/primitives` module, depending on whether effect pages remain first-class consumers.
- Route all subsection color/radius/focus styling through `Surface` or a shared `NestedContentCard` recipe.
- Add tests covering variant/padding mapping and heading-level behavior.

### 6. Make public icon badges a tokenized component, not a className escape hatch

Evidence:

- `IconBadge` is used at least 14 times.
- Several consumers pass custom tone classes, for example `src/features/reports/components/TimelineSection.tsx:79`, `src/components/pages/AboutArchivePreview.tsx:195`, and `src/components/pages/AboutArchivePreview.tsx:207`.
- The base implementation hardcodes a single white surface at `src/components/common/IconBadge.tsx:12`.

Recommendation:

- Add `tone?: "accent" | "neutral" | "success" | "warning" | "danger"` and `size?: "sm" | "md"` variants.
- Route custom color needs through those variants first; keep `className` for layout only during migration.
- Use this component as the standard leading visual for section headers, cards, and empty states where an icon badge is intended.

### 7. Formalize typography and spacing tokens beyond current text utilities

Evidence:

- Typography utilities already exist in `src/styles/utilities-typography.css:1` through `src/styles/utilities-typography.css:57`.
- `src/styles/base.css:37` through `src/styles/base.css:51` defines type-size, leading, tracking, and reading-measure tokens.
- Repeated arbitrary tracking values remain common: `tracking-[0.3em]` appears 18 times, `tracking-[0.2em]` 12 times, `tracking-[0.35em]` 8 times.
- `src/components/ui/button.tsx:79`, `src/components/ui/button.tsx:51`, and several dev/public components duplicate uppercase-label letter spacing recipes.

Recommendation:

- Add a small label typography API: `type-meta-label`, `type-control-label`, `type-chip-label`, and maybe `type-kicker`.
- Replace arbitrary tracking classes in shared primitives and public-route components first.
- Consider spacing tokens in CSS variables for common gaps/padding only where semantic intent repeats; do not tokenize every Tailwind spacing value.

### 8. Align font ownership between Next font, CSS variables, and Tailwind config

Evidence:

- `src/app/fonts.ts:3` loads Blinker as `--font-display`.
- `src/styles/base.css:35` defines body as `Inter` fallback, but no local/imported Inter font owner is present in `src/app/fonts.ts`.
- `tailwind.config.js:16` repeats `Inter` and the display stack, while `src/styles/base.css:35` and `src/styles/base.css:36` define similar stacks.

Recommendation:

- Decide whether Inter is intentionally system-resolved or should be loaded explicitly.
- Move the font-stack source of truth into tokens, then have Tailwind read from those variables where practical.
- Add `--font-family-mono` if code/pre/json surfaces remain part of the public brand language.

## P3 Recommendations

### 9. Expand ownership rules from known bad names to explicit promotion policy

Evidence:

- `docs/architecture/project-layout.md:32` says `src/components/ui` is shared primitives only.
- `docs/architecture/project-layout.md:33` says `src/components/common` should promote only after a second runtime consumer, stable prop API, and no feature-domain dependency.
- `src/components/ui/ownership.test.ts:40` enforces some barrel and button ownership constraints.

Recommendation:

- Add a short shared UI inventory table to `docs/architecture/project-layout.md` or a dedicated `docs/ui-system.md`.
- For each shared component, record owner, intended consumers, promotion criteria, and whether feature/domain imports are allowed.
- Add a test that fails when `src/components/common` imports from `src/features`, `src/app`, or domain data modules, with narrow allowlists for type-only icon names if needed.

### 10. Review UI dependencies as part of ownership cleanup

Evidence:

- UI dependencies include Radix primitives, `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate`, `framer-motion`, `cmdk`, `@iconify/react`, `lucide-react`, `lightgallery`, and `yet-another-react-lightbox` in `package.json:74` through `package.json:118`.
- `@iconify-json/lucide`, `@iconify/react`, and `lucide-react` coexist.
- `framer-motion` is present, but shared primitives mostly use CSS animations/transitions.

Recommendation:

- During migration, document which icon library is canonical for shared UI. Today `Icon`/Iconify appears to be the practical shared abstraction, while `lucide-react` is another dependency path.
- Keep motion in CSS for shared primitives unless a component needs gesture/layout animation. If `framer-motion` is feature-only, document its owner.
- Tie package ownership to component ownership so route-specific UI libraries do not become implicit global dependencies.

## Immaterial Gaps

- I did not run visual browser QA. This audit is about extraction opportunities and token ownership, not pixel-regression verification.
- I did not classify every single `src/components/pages` file because the requested lane centered on `ui`, `common`, tokens, fonts, dependencies, and ownership tests. The raw-class counts include `src/components/pages` because those files are material consumers of shared primitives.
- I did not verify bundle size. Dependency ownership recommendations are based on package inventory and import patterns, not measured bundle impact.
- I did not inspect generated files; no generated-file behavior is material to this UI standardization pass.

## Suggested Migration Order

1. Baseline `tokenAudit` findings and fail only on new shared/public escapes.
2. Tokenize shared internals: `IconBadge`, `StateCard`, `ArticleSubsectionHeader`, `Button`, and `Surface`.
3. Split article subsection primitives and route them through the surface recipe layer.
4. Collapse `Button` variants by moving search/tab/list/card recipes to owning components.
5. Migrate public cards/list cards to named surface recipes and delete corresponding light-mode override groups.
6. Document component ownership and dependency ownership after each promoted primitive stabilizes.

