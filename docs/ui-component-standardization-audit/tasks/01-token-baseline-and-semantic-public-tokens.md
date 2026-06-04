# Token Baseline And Semantic Public Tokens

## Objective

Turn the existing token audit into a migration gate and add semantic tokens/classes for the most repeated public UI escapes.

## Scope

- `src/theme/tokenAudit.ts`
- `src/theme/index.test.ts`
- `src/theme/theme-token-interface.json`
- `src/styles/utilities-theme.css`
- `src/styles/utilities-typography.css`
- `src/styles/theme-light-mode.css`
- `src/app/fonts.ts`
- `tailwind.config.js`

## Source findings

- `shared-ui-and-tokens.md`
- `public-pages-and-chrome.md`
- `dev-editor-ui.md`

## Affected files/modules

Token audit, theme token interface, semantic CSS utilities, light-mode shims, typography utilities, font ownership, Tailwind theme aliases.

## Proposed component/API shape

- `theme:tokens:check` script or equivalent test entry.
- Reviewed token-audit baseline committed with existing findings.
- Semantic classes: `theme-icon-accent`, `theme-icon-muted`, `theme-icon-badge`, `theme-badge-surface`, `theme-public-overline`, `theme-public-section-rule`, `theme-public-skeleton-surface`.
- Label typography utilities: `type-meta-label`, `type-control-label`, `type-chip-label`, `type-kicker`.
- Editor token namespace mapping to existing theme variables: `--editor-panel-*`, `--editor-field-*`, `--editor-code-*`, `--editor-chip-*`.

## Migration steps

1. Generate a reviewed baseline for current token-audit findings.
2. Make tests fail only on findings absent from the baseline.
3. Add semantic public/common token classes used by shared primitives first.
4. Add editor semantic variables without migrating dev screens yet.
5. Replace raw classes inside shared primitives before route-level consumers.
6. Track removable groups in `theme-light-mode.css` as migrations land.

## Tests/verification

- Token audit reports no unreviewed new findings.
- Theme index tests cover baseline behavior.
- Spot-check light and dark mode on public pages after shared primitive migrations.

## Dependencies

- None.

## Non-goals

- Do not redesign the visual palette.
- Do not remove all raw classes in one PR.
- Do not force dev/editor migrations before editor primitives exist.
