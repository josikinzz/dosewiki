# Dev Substance Source Workspace Module

## Title

Concentrate article source selection, quote availability, and preview state in a source workspace Module.

## Status

Proposed

## Files

- `src/features/dev/tools/substance-editor/useSubstanceEditorSourceData.ts`
- `src/features/dev/tools/substance-editor/SubstanceEditorTab.tsx`
- `src/features/dev/tools/substance-editor/SubstanceEditorSourcesSection.tsx`
- `src/features/dev/tools/substance-editor/SubstanceEditorSelectionSection.tsx`
- `src/features/dev/tools/substance-editor/SourcePreviewModal.tsx`
- `src/features/dev/tools/substance-editor/useSourcePreviewState.ts`
- `src/features/dev/tools/substance-editor/SubstanceEditorContext.tsx`
- `src/hooks/useArticleSources.ts`
- `src/hooks/useQuotes.ts`

## Problem

`useSubstanceEditorSourceData` is the main Module for the article generator's source workspace, but its Interface is nearly as broad as its Implementation. It derives review status from articles, filters low-priority source candidates through the public library, sorts and searches substances, loads Convex article sources, queries seven quote sections, parses quote source names and favicons, manages preview modal state, constructs generic source fallback content, and builds the context value consumed by section generators.

The seam between the `/dev` article generator and source material is therefore shallow. Adding a quote-backed section requires editing repeated hook calls, repeated source-info memos, the context value, the returned state, and UI prop plumbing. Changing source selection or preview behavior requires understanding library records, Convex articleSources, quote documents, source favicons, selected-substance state, and generator context assembly at once.

This is distinct from the article source document contract and quote section contract tasks. Those cover storage and canonical section identity. This task covers the interactive dev source workspace that combines those data sources into editor-ready state.

## Solution Plan

Create a dev substance source workspace Module with a small Interface:

- selection state: search, sort, low-priority visibility, selected substance, available source metadata, and review status
- source material state: loaded source document, generic sources, quote material by section descriptor, source attribution summaries, and loading/error state
- preview commands: open source, close source, and resolve content by source id
- generator context command: build the context consumed by section generators

Use quote section descriptors when available so quote-backed sections are iterated rather than hard-coded. Keep Convex articleSources, quote hooks, public library records, and favicon lookup as Adapters behind the workspace seam. `SubstanceEditorSelectionSection`, `SubstanceEditorSourcesSection`, and `ArticleSectionGenerator` should receive view models from the workspace instead of assembling source facts themselves.

## Benefits

- **Locality**: Search/sort policy, selected-source loading, quote availability mapping, source preview state, and generator-context assembly become source-workspace changes instead of tab-wide changes.
- **Leverage**: New quote-backed sections or source-material badges can be added through descriptors and workspace projection rather than repeated hook and prop additions.
- **Testability**: Workspace tests can use fake library, article source, and quote Adapters to cover filtering, sorting, source loading, quote attribution parsing, preview content lookup, and generator context creation without rendering the full editor tab.

## Implementation Notes

- Start by wrapping the current hook behavior behind a workspace Interface; do not change source precedence or quote availability semantics.
- Keep `useSourcePreviewState` as an Adapter or move its reducer logic into the workspace after parity tests exist.
- Model loading failures explicitly. The current Implementation logs source-load errors but only exposes `isLoadingSubstance`; a workspace result can preserve current UI behavior while making failures testable.
- Avoid duplicating the storage contract work from the source document and quote section tasks. This Module should consume those contracts once they exist, not redefine them.

## Verification

- Add hook tests for source workspace selection, search, sort orders, low-priority toggle, review status projection, selected-source load success/failure, and preview open/close behavior.
- Add tests that quote material and source attribution summaries are produced for every configured quote-backed section.
- Add a light `SubstanceEditorTab` integration test proving selection, sources, and section generator context still receive the expected data.
- Run `npm run test -- src/features/dev/tools/substance-editor` and `npm run typecheck`.
