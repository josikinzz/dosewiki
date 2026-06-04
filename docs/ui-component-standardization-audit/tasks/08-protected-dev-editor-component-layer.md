# Protected Dev Editor Component Layer

## Objective

Create a dev-owned component layer for protected editor tooling while keeping public/common primitives separate.

## Scope

- `src/features/dev/components/`
- `src/features/dev/forms/`
- `src/features/dev/profile/`
- `src/features/dev/tags/`
- `src/features/dev/tools/`
- `src/features/dev/pages/`
- Shared controls used by dev: `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Alert`, `Surface`, `StateCard`

## Source findings

- `dev-editor-ui.md`
- `shared-ui-and-tokens.md`

## Affected files/modules

Dev page chrome, editor forms, schema fields, profile editor, tag editor, citation review panels, index layout toolbar, changelog/diff panels, JSON editor wrappers, server health indicator, notices.

## Proposed component/API shape

```tsx
<EditorPanel variant="default|subtle|inset|danger|toolbar|empty" />
<EditorPanelHeader eyebrow icon title description meta actions />
<EditorPanelBody density="default|compact" />
<EditorField label required description error counter htmlFor tone />
<EditorFieldRow layout="single|twoColumn|threeColumn|actionTrailing" />
<EditorToolbar variant="wrap|compact|sticky|split" />
<EditorActionGroup label align separatorBefore />
<EditorActionStatus status="dirty|saved|saving|error" />
<EditorStatusPill tone loading live />
<EditorNotice notice />
<CodeSurface />
<DiffSurface title diffText maxHeight emptyText actions />
<JsonEditorPanel title value error readOnly onApply actions />
<TagToken variant="default|compact|interactive|readonly|danger" />
<EditorNavTabs />
<EditorSegmentedControl />
```

## Migration steps

1. Add `EditorPanel`, `EditorPanelHeader`, and `EditorNotice` under `src/features/dev/components/`.
2. Migrate citation review panels first because they contain many repeated panel/header/list row patterns.
3. Add `EditorField` wrappers around existing `Input`, `Textarea`, and `Select`; convert schema text fields and profile bio.
4. Extract `EditorToolbar` from `LayoutToolbar`; migrate copy/download/save/reset clusters.
5. Add `DiffSurface` and `JsonEditorPanel` around existing dev-owned primitives.
6. Extract `TagToken` from `TagMultiSelectSelectedTags`; use it in `TagArrayField`.
7. Extract `EditorNavTabs`/`EditorSegmentedControl` from dev chrome and dataset tabs.

## Tests/verification

- Existing dev ownership tests still prevent dev widgets from moving into common UI.
- Field wrappers preserve `aria-invalid`, `aria-describedby`, helper/error text, and counters.
- Toolbar actions remain ordinary child buttons and keep command semantics.
- Diff/JSON wrappers preserve copy/download/apply behavior.
- Visual review `/dev` tools, citation review, profile, tags, about editor, index layout, and changelog.

## Dependencies

- Task 01.

## Non-goals

- Do not promote `DiffPreview`, `JsonEditor`, `TagMultiSelect`, or health/citation review adapters to public/common.
- Do not add feature-named variants to shared `Button`.
- Do not make public `SectionCard` more admin-specific.
