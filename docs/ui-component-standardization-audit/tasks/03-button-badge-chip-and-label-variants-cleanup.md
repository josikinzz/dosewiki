# Button, Badge, Chip, And Label Variants Cleanup

## Objective

Reduce recipe-like control variants in shared primitives and standardize repeated public chips, pills, badges, icon badges, and label typography.

## Scope

- `src/components/ui/button.tsx`
- `src/components/ui/badge.tsx`
- `src/components/common/IconBadge.tsx`
- `src/components/ui/ownership.test.ts`
- Public chip/pill consumers across article, search, profile, taxonomy, effects, and reports pages

## Source findings

- `shared-ui-and-tokens.md`
- `article-substance-ui.md`
- `public-pages-and-chrome.md`
- `effects-and-reports-ui.md`
- `dev-editor-ui.md`

## Affected files/modules

Button variant table, badge variants, public overline labels, icon badges, status pills, taxonomy/filter chip navigation, hero tags, featured badges, removable tags.

## Proposed component/API shape

- `Button`: keep primitive axes only: tone, emphasis, size, shape, and icon-only.
- `IconBadge`: `tone?: "accent" | "neutral" | "success" | "warning" | "danger"`, `size?: "sm" | "md"`.
- `ArticlePill`: `tone`, `icon`, `href`, `onSelect`, `size`.
- `ArticleStatusPill`: maps public status text to tone.
- `PublicChipNav` or `FilterPillGroup`: active, count, href, icon.
- `PublicOverline`: tokenized uppercase label component/class.

## Migration steps

1. Tokenize `IconBadge` internals and migrate shared consumers off custom color class escapes.
2. Extract public article pills/status pills from legality, hero classifications, pharmacology qualifiers, and interactions.
3. Extract chip navigation for mechanism qualifiers and future filter surfaces.
4. Move `Button` recipe variants such as `card`, `listItem`, `suggestion`, and `tab*` into owning components.
5. Extend ownership tests to block new recipe-like `Button` variants once migrated.

## Tests/verification

- Button ownership tests cover forbidden variant naming patterns.
- Focus, hover, and active states are preserved on links/buttons.
- Article/public page smoke tests verify chips still navigate and status labels remain readable.

## Dependencies

- Task 01.

## Non-goals

- Do not remove a `Button` variant before all consumers are migrated.
- Do not encode route-specific names in shared `Button` or `Badge`.
- Do not redesign pill colors; preserve current tones through semantic mappings.
