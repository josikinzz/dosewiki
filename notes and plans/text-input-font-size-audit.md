# Text Input Font Size Audit (2025-10-16)

## Approach
- Parsed React components to enumerate every user-facing `<input>` and `<textarea>` capable of free-text entry.
- Confirmed font sizing from Tailwind utility classes (`text-sm` → 0.875 rem) and inline style overrides, mapping rem values to px using the project’s default 16 px root size.
- Cross-checked shared primitives (`baseInputClass`, `baseTextareaClass`, `TagMultiSelect`, `JsonEditor`) to account for reused styling.

## Findings

### Public Surface
- Global search (`src/components/common/GlobalSearch.tsx:290`) sets `style={{ fontSize: "max(16px, 1rem)" }}` plus `text-base`, so the field renders at 16 px on the default 16 px root.

### Dev Tools – Credentials Gate (`src/components/pages/DevModePage.tsx:1608-1662`)
- Username and password inputs reuse `baseInputClass` (`DevModePage.tsx:83`), which applies Tailwind `text-sm` (0.875 rem ≈ 14 px).

### Dev Tools – Article Workspace (UI mode)
- All single-line inputs for metadata, dosage tables, duration defaults, tolerance, and citation fields consume `baseInputClass` from `ArticleDraftFormFields.tsx:17`, yielding 14 px text.
- Long-form editors (Subjective effects, Addiction potential, Interaction buckets, Cross tolerances, Notes) use `baseTextareaClass` (`ArticleDraftFormFields.tsx:19`), also `text-sm` → 14 px.
- Tag selectors for Index tags, Categories, Chemical class, Psychoactive class, and Mechanism of action rely on the `TagMultiSelect` query input (`TagMultiSelect.tsx:483-507`) styled with `text-sm` (14 px).

### Dev Tools – Article Workspace (JSON view)
- The JSON editor (`JsonEditor.tsx:17-55`) forces a monospace `fontSize: 12`, so the code editing surface renders at 12 px.

### Dev Tools – Change Log Tab (`DevModePage.tsx:2230-2298`)
- Start date, End date, and keyword search inputs inherit `baseInputClass`, keeping all filter text at 14 px.

### Dev Tools – Tag Editor Tab (`TagEditorTab.tsx:360-515`)
- Search, rename, and optional relabel fields share the tab-level `baseInputClass` defined at `TagEditorTab.tsx:14`, so each text box renders at 14 px.

### Dev Tools – Profile Tab (`ProfileEditorTab.tsx:452-610`)
- Display name, remote avatar URL, link label, and link URL inputs all receive the parent-supplied `baseInputClass` from `DevModePage`, holding steady at 14 px.
- The Bio textarea extends the same class (`ProfileEditorTab.tsx:553`), producing 14 px body copy inside the multiline editor.

## Summary Table

| Surface | Fields | Font size |
| --- | --- | --- |
| Public search | Global search bar | 16 px |
| Dev Tools credentials | Username, password | 14 px |
| Dev Tools article UI | Metadata inputs, dosage/duration tables, tolerance inputs, citation inputs | 14 px |
| Dev Tools article UI (textareas) | Subjective effects, Addiction potential, Interactions, Cross tolerances, Notes | 14 px |
| Dev Tools tag pickers | `TagMultiSelect` query fields (index tags, categories, chemical class, psychoactive class, mechanisms) | 14 px |
| Dev Tools JSON view | Raw JSON editor | 12 px |
| Dev Tools change log filters | Start date, End date, keyword search | 14 px |
| Tag Editor tab | Search, rename, optional relabel inputs | 14 px |
| Profile tab | Display name, remote avatar URL, link label, link URL | 14 px |
| Profile tab (textarea) | Bio field | 14 px |

## Observations
- All admin-facing form controls share the same `text-sm` baseline, so any future global font-size adjustment can be centralized by modifying the shared `baseInputClass` / `baseTextareaClass` definitions.
- The only deviation is the JSON editor’s 12 px monospace configuration, which intentionally mirrors code-style editors; adjust `JsonEditor.tsx:22` if a larger size is desired.
- Public-facing search already enforces 16 px minimum sizing for accessibility compliance on mobile Safari (prevents zoom-on-focus behavior).
