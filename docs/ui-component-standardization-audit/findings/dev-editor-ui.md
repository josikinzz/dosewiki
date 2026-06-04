# Dev / Editor UI Standardization Audit

## Skills read

- `impeccable extract` - `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Scope

Audit lane: protected dev/editor UI.

Reviewed surfaces include `/dev` chrome, editor forms, tag multi select, tools, prompts-adjacent editor surfaces, profile editing, notices, editor health, commit/changelog, diff, and JSON views under:

- `src/features/dev/`
- `src/app/dev/`
- shared UI dependencies in `src/components/ui/` and `src/components/common/`

No implementation changes were made.

## Executive Summary

The protected editor UI already has useful primitive ingredients, but they are split across three layers:

- Public/common primitives: `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Alert`, `Surface`, `StateCard`, and `SectionCard`.
- Dev-owned widgets: `DiffPreview`, `JsonEditor`, `TagMultiSelect`, `EditorServerHealthIndicator`, and commit/notice utilities.
- Local one-off recipes: repeated panel headers, uppercase labels, toolbar groups, active list rows, empty states, status badges, danger zones, diff/json wrappers, and field help/error text.

The right extraction path is not to move dev widgets into public common UI. `src/components/ui/ownership.test.ts` already enforces that `DiffPreview`, `JsonEditor`, and `TagMultiSelect` stay under the dev feature boundary. Instead, create a protected editor design layer under `src/features/dev/components/` that standardizes dense tooling screens while keeping public article/profile design primitives separate.

## Existing Reusable Foundations

### Public/common candidates already in use

- `Button` variants and sizes in `src/components/ui/button.tsx` are broadly useful, but the variant list has grown to include product and editor-adjacent shapes such as `glass`, `ghostPill`, `tabPrimary`, `tabSecondary`, `suggestion`, `card`, and icon variants. The ownership test at `src/components/ui/ownership.test.ts` correctly prevents feature-named variants.
- `Input` and `Textarea` in `src/components/ui/input.tsx` and `src/components/ui/textarea.tsx` already expose `default` and `error` variants using theme tokens. New dev forms should use these instead of hard-coded `border-white/10 bg-white/5 focus:border-fuchsia-500/50`.
- `Select` in `src/components/ui/select.tsx` is a solid shared primitive, though it still hard-codes the dark editor surface (`bg-slate-950/60`, `text-white`, `fuchsia` focus) more than `Input`/`Textarea` do.
- `Badge` in `src/components/ui/badge.tsx` is useful for both public and dev status chips. Dev-specific semantic maps should wrap it rather than adding feature variants.
- `Alert` in `src/components/ui/alert.tsx` is the best target for standardized notice rendering; several dev files still render inline alert boxes manually.
- `StateCard` in `src/components/common/StateCard.tsx` is a reasonable shared empty/loading/error state component and is already used by citation review.
- `SectionCard` in `src/components/common/SectionCard.tsx` is public-biased because it wraps `Surface` with `variant="public"` and public animation classes. It is being used heavily for dev panels, but should not be the long-term admin panel primitive.

### Dev-owned primitives already worth keeping dev-only

- `DiffPreview` in `src/features/dev/components/DiffPreview.tsx` is a protected diff reader used by changelog, about editor, and tag editor.
- `JsonEditor` in `src/features/dev/components/JsonEditor.tsx` is a protected code surface using `react-simple-code-editor` and Prism JSON highlighting.
- `TagMultiSelect` in `src/features/dev/components/tag-multi-select/TagMultiSelect.tsx` is an accessible dev combobox-like multi-select with `focus` and `button` open strategies.
- `EditorServerHealthIndicator` in `src/features/dev/components/EditorServerHealthIndicator.tsx` is already a compact status pill with refresh affordance.
- `getDevNoticeRenderProps` from `src/features/dev/notices/devNoticeLifecycle.ts` is the right model-level bridge for standard notice rendering.

## Extraction Candidates

### 1. `EditorPanel` / `EditorPanelHeader`

Problem:

- Dense dev screens repeatedly use `SectionCard` with custom heading blocks, eyebrow labels, icons, descriptions, and trailing actions.
- `SectionCard` is public-biased and makes dev screens inherit public section animation/surface choices.

Concrete refs:

- `src/features/dev/profile/ProfileEditorTab.tsx` uses `SectionCard` for profile editing with eyebrow, title, description, trailing public-profile link, and icon.
- `src/features/dev/tags/TagEditorTab.tsx` repeats header panel structure and pending changelog panels.
- `src/features/dev/tools/citation-review/CitationReviewPanels.tsx` repeats section headers in `CitationQueueHeader`, `CitationSelectedSummary`, `CitationChecklistPanel`, and `CitationEvidenceSection`.
- `src/features/dev/tools/about/AboutEditorTab.tsx` uses `SectionCard` around diff review.
- `src/features/dev/tools/index-layout/CategoryEditorDetailsPanel.tsx` creates a local rounded bordered details panel.

Proposed variants:

- `EditorPanel`: `default`, `subtle`, `inset`, `danger`, `toolbar`, `empty`.
- `EditorPanelHeader`: optional `eyebrow`, `icon`, `title`, `description`, `meta`, `actions`.
- `EditorPanelBody`: controls internal spacing without nested card stacks.

Migration path:

1. Add dev-only components under `src/features/dev/components/editor-panel/`.
2. Migrate citation review panels first because they have the most repeated panel/header/list row patterns.
3. Migrate tag editor and changelog panels.
4. Leave public `SectionCard` usage in public-facing pages untouched.

Public-site candidate?

- The abstract `Surface` tokens belong in public UI.
- `EditorPanel` itself is dev-only because it encodes dense admin layout, not article-site presentation.

### 2. `EditorField`, `EditorFieldRow`, and field state tokens

Problem:

- There are two parallel form styles: schema fields hand-roll classes, while newer profile/tag/about tools use `components/ui` primitives.
- Field labels, required marks, helper text, error text, counters, and `aria-describedby` are inconsistent.

Concrete refs:

- `src/features/dev/forms/schema/fields/TextField.tsx` hand-rolls label/input/helper classes.
- `src/features/dev/forms/schema/fields/TextareaField.tsx` handles `aria-invalid` and error text locally.
- `src/features/dev/forms/schema/fields/TagArrayField.tsx` duplicates tag-entry field shell behavior.
- `src/features/dev/profile/BioEditor.tsx` has a label plus character counter pattern.
- `src/features/dev/profile/LinkManager.tsx` has grouped rows, empty state, and validation text.
- `src/features/dev/tags/TagMutationForms.tsx` uses local labels for select/input rows.
- `src/features/dev/tools/index-layout/CategoryEditorDetailsPanel.tsx` repeats compact labels and form grid.

Proposed variants:

- `EditorField`: `label`, `required`, `description`, `error`, `counter`, `htmlFor`, `tone`.
- `EditorFieldRow`: `single`, `twoColumn`, `threeColumn`, `actionTrailing`.
- `EditorFormSection`: title plus grouped fields with optional divider.
- Field state tokens: `default`, `focus`, `error`, `warning`, `disabled`, `readonly`, `dirty`.

Migration path:

1. Wrap `Input`, `Textarea`, and `SelectTrigger` with dev-only field shell only; do not fork the controls.
2. Convert schema `TextField` and `TextareaField` first to centralize label/helper/error behavior.
3. Convert `TagArrayField` or replace it with a `TagMultiSelect`-backed field where options are known.
4. Convert profile `BioEditor` and `LinkManager` to use the same field shell.

Public-site candidate?

- The base `Input`, `Textarea`, `Select`, and `Label` remain public/common.
- `EditorField` is dev-only unless a later public form has the same dense helper/error/counter needs.

### 3. `EditorToolbar` / `ActionGroup`

Problem:

- Toolbar/action clusters use repeated flex wrappers, separators, `Button variant="glass"`, uppercase micro-label spans, and ad hoc save notices.

Concrete refs:

- `src/features/dev/tools/index-layout/LayoutToolbar.tsx` is a clear toolbar recipe with primary save group, reset/restore group, auto-sort group, JSON toggle, and inline status text.
- `src/features/dev/tags/TagEditorTab.tsx` repeats copy/download diff action groups.
- `src/features/dev/pages/DevModeChangeLogTab.tsx` repeats filter quick actions and entry copy/download actions.
- `src/features/dev/tools/citation-review/CitationReviewPanels.tsx` repeats approve/reject action clusters.
- `src/features/dev/profile/ProfileEditorTab.tsx` repeats save/reset form actions.

Proposed variants:

- `EditorToolbar`: `wrap`, `compact`, `sticky`, `split`.
- `EditorActionGroup`: optional `separatorBefore`, `label`, `align`.
- `EditorActionStatus`: `dirty`, `saved`, `saving`, `error`.

Migration path:

1. Extract the group/separator/status structure from `LayoutToolbar`.
2. Make buttons remain ordinary `Button` children, so the abstraction controls layout, not command semantics.
3. Replace changelog/tag/about copy-download clusters.
4. Add a lint/test guard only if feature-specific button variants start reappearing.

Public-site candidate?

- General action grouping can remain public-neutral, but this exact dense toolbar should be dev-only.

### 4. `StatusPill`, `StatusBadge`, and health/notice tone maps

Problem:

- Status rendering uses `Badge`, manual colored boxes, manual icon+message rows, and dedicated health pills with different tone vocabularies.

Concrete refs:

- `src/features/dev/components/EditorServerHealthIndicator.tsx` maps `healthy`, `unhealthy`, `error`, `checking` to pill colors/icons.
- `src/features/dev/components/DevCommitCard.tsx` maps `success`, `error`, `pending` to icon+message rows.
- `src/features/dev/pages/DevModeChangeLogTab.tsx` manually renders notice boxes for success/error.
- `src/features/dev/profile/ProfileEditorTab.tsx` uses `getDevNoticeRenderProps` plus `Alert`.
- `src/features/dev/tags/TagEditorTab.tsx` uses `getDevNoticeRenderProps` plus `Alert`.
- `src/features/dev/tools/citation-review/CitationReviewPanels.tsx` has `CITATION_STATUS_META` and `CITATION_SEVERITY_META` wrapped in `Badge`.

Proposed variants:

- `EditorStatusPill`: `success`, `danger`, `warning`, `info`, `pending`, `neutral`; optional `loading`, `title`, `live`.
- `EditorNotice`: Alert-backed message using `getDevNoticeRenderProps`.
- `EditorHealthBadge`: thin adapter for server health, still dev-only.

Migration path:

1. Extract a small tone map shared by dev notices and health.
2. Replace manual notice boxes in changelog and citation review action errors with `EditorNotice`.
3. Keep citation domain status labels in `citationReviewModels.ts`, but render via `StatusBadge`/`Badge`.

Public-site candidate?

- Tone tokens and `Alert` variants are public/common.
- Health, reviewer, commit, and editor notice adapters are dev-only.

### 5. `CodeSurface`, `JsonEditorPanel`, and `DiffSurface`

Problem:

- `DiffPreview` and `JsonEditor` are good dev primitives, but their surrounding labels, apply/copy/download controls, max-height behavior, and empty/no-op states are repeated outside them.

Concrete refs:

- `src/features/dev/components/DiffPreview.tsx` owns line coloring and scroll shell.
- `src/features/dev/components/JsonEditor.tsx` owns JSON syntax editing shell.
- `src/features/dev/tools/index-layout/IndexLayoutJsonEditor.tsx` wraps `JsonEditor` with label and apply action.
- `src/features/dev/pages/DevModeChangeLogTab.tsx` wraps `DiffPreview` per commit card.
- `src/features/dev/tools/about/AboutEditorTab.tsx` renders markdown and subtitle diffs.
- `src/features/dev/tags/TagEditorTab.tsx` renders pending changelog diff and copy/download actions.

Proposed variants:

- `CodeSurface`: shared shell for monospace scrollable content.
- `DiffSurface`: title, `diffText`, `maxHeight`, `emptyText`, optional copy/download actions.
- `JsonEditorPanel`: title, `value`, `error`, `readOnly`, `onApply`, `actions`.

Migration path:

1. Keep `DiffPreview` and `JsonEditor` low-level and dev-owned.
2. Add panel wrappers so index layout, changelog, about, and tag editor use the same labeled code-surface layout.
3. Add an `emptyText` or `noDiff` variant instead of manually passing `"# Dataset\n\nNo differences detected."`.

Public-site candidate?

- None for current needs. These surfaces expose protected editorial diffs, JSON, and generated drafts.

### 6. Tag control consolidation

Problem:

- There are two tag entry systems: advanced `TagMultiSelect` and simple `TagArrayField`. Tag pills, remove buttons, create flows, helper text, and compact variants are not shared.

Concrete refs:

- `src/features/dev/components/tag-multi-select/TagMultiSelect.tsx`
- `src/features/dev/components/tag-multi-select/TagMultiSelectSelectedTags.tsx`
- `src/features/dev/components/tag-multi-select/TagMultiSelectMenu.tsx`
- `src/features/dev/forms/rhf/ControlledTagMultiSelect.tsx`
- `src/features/dev/forms/schema/fields/TagArrayField.tsx`
- `src/features/dev/tags/TagListPanel.tsx` renders tag list rows but not tag input pills.

Proposed variants:

- `TagToken`: `default`, `compact`, `interactive`, `readonly`, `danger`.
- `TagInputSurface`: shared token container with focus/error/disabled state.
- `TagPickerMenu`: option row variants with count, create option, and empty state.

Migration path:

1. Extract `TagToken` from `TagMultiSelectSelectedTags`.
2. Use it in `TagArrayField` to remove duplicated pill/remove button classes.
3. Add field-shell support to `TagMultiSelect` so it can participate in `EditorField`.
4. Keep `ControlledTagMultiSelect` as the React Hook Form adapter.

Public-site candidate?

- A readonly `TagToken` may be useful publicly if public pages need consistent chips.
- Editable tag pickers and create/delete behavior are dev-only.

### 7. Navigation and tab primitives for dev chrome

Problem:

- `/dev` uses primary and secondary tabs in `DevModePageChrome`, while dataset tabs and tool-local selectors use separate local styles.

Concrete refs:

- `src/features/dev/pages/DevModePageChrome.tsx` renders primary tabs for Tools, Change log, Profile and secondary tool tabs for Articles, Citation Review, Tags, About, Index layout.
- `src/features/dev/tools/index-layout/DatasetTabs.tsx` provides a local dataset tab switcher.
- `src/components/ui/button.tsx` already has `tabPrimary` and `tabSecondary` variants, but the dev chrome uses Tabs primitives with local `tabTriggerClass`.

Proposed variants:

- `EditorNavTabs`: wraps Tabs list/trigger layout for protected routes.
- `EditorSegmentedControl`: for dataset/tool-local mode switches.
- `EditorRouteTab`: supports icon, label, disabled reason, and compact behavior.

Migration path:

1. Extract from `DevModePageChrome` without changing route state.
2. Migrate `DatasetTabs` to `EditorSegmentedControl`.
3. Reconcile `Button` tab variants with the Tabs trigger styles; remove unused variants only after usage is verified.

Public-site candidate?

- Public navigation should keep its own brand/navigation rules.
- Dev route tabs are protected UI only.

## Token Candidates

### Keep public/common tokens

- Surface tokens: `--theme-field-surface`, `--theme-border-subtle`, `--theme-text-primary`, `--theme-text-faint`, `--theme-ring-soft`, `--theme-accent-strong`.
- Semantic tone tokens: `--theme-danger-*`, `--theme-warning-*`, `--theme-success-*`.
- Shared control sizing: button/input/textarea/select sizes from `src/components/ui/`.

### Add dev/editor semantic tokens

These can map to existing theme variables at first:

- `--editor-panel-bg`
- `--editor-panel-bg-subtle`
- `--editor-panel-border`
- `--editor-panel-border-strong`
- `--editor-field-bg`
- `--editor-field-border`
- `--editor-field-focus`
- `--editor-code-bg`
- `--editor-code-border`
- `--editor-code-line-add-bg`
- `--editor-code-line-add-text`
- `--editor-code-line-remove-bg`
- `--editor-code-line-remove-text`
- `--editor-chip-bg`
- `--editor-chip-border`
- `--editor-chip-text`
- `--editor-toolbar-separator`

Avoid adding new feature-specific color names such as citation, tag, profile, or changelog tokens. Those should be semantic state maps over the editor tokens.

## Public-Site Design-System Candidates

Promote or keep these as public/common:

- `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Alert`, `Surface`, `StateCard`.
- Generic `EmptyState` behavior from `StateCard`, if public pages need a lighter presentation.
- Readonly chip/tag display, only if public pages need the same compact metadata token.
- Semantic tone variables for success, warning, danger, and neutral states.

Do not promote these to public/common right now:

- `DiffPreview`
- `JsonEditor`
- `TagMultiSelect`
- `EditorServerHealthIndicator`
- commit panels, citation review rows, reviewer status maps, JSON apply panels, changelog diff cards

This matches the ownership boundary already tested in `src/components/ui/ownership.test.ts`.

## Suggested Migration Order

1. Create `src/features/dev/components/editor-panel/` with `EditorPanel`, `EditorPanelHeader`, and `EditorNotice`.
2. Create `src/features/dev/components/editor-field/` with `EditorField`, `EditorFieldRow`, and adapters around existing `Input`, `Textarea`, and `Select`.
3. Convert schema `TextField`, `TextareaField`, and profile `BioEditor` to the field shell.
4. Extract `EditorToolbar` from `LayoutToolbar`, then migrate copy/download and save/reset clusters.
5. Add `DiffSurface` and `JsonEditorPanel` wrappers around existing dev-only code primitives.
6. Extract `TagToken` and use it in both `TagMultiSelectSelectedTags` and `TagArrayField`.
7. Extract `EditorNavTabs` / `EditorSegmentedControl` after the panel/field/toolbar layer settles.

## Risks and Guardrails

- Do not move dev-owned widgets into `src/components/common/`; the existing ownership test should remain.
- Do not add feature-named variants to `Button`. Use composition and local semantic maps.
- Avoid making `SectionCard` more admin-specific. Introduce `EditorPanel` instead.
- Keep citable/editor-only data surfaces protected; diff/json/citation evidence components should stay under `src/features/dev`.
- Use wrappers that preserve existing component APIs during migration; this allows incremental conversion without changing editor state machines.
