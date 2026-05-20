# Content Model Editorial Review Visibility Policy

## Files

- `src/schema/substance/article.ts`
- `src/schema/substance/editorial.ts`
- `src/features/dev/forms/EditorialReviewFieldsRHF.tsx`
- `src/features/dev/tools/substance-editor/useSubstanceEditorSourceData.ts`
- `src/features/dev/tools/substance-editor/yamlParser*.ts`
- `src/features/article/components/ArticleLayout.tsx`
- `src/features/article/components/sections/TableOfContentsSection.tsx`
- `lib/convex/publicData.substances.ts`
- `convex/lib/validators.ts`
- `convex/schema.ts`
- `scripts/batch/`
- `scripts/prepopulate/`

## Problem

`editorial_review` is correctly modeled as editor-only metadata in the repo notes and dev form, but that rule is currently a convention spread across callers. The schema includes the field, Convex permits it, the dev selector reads review status, the YAML parser normalizes it, and the public article route currently omits it because no public section renders it.

That makes the visibility Interface shallow. Public safety depends on every public projection, layout, generator, and parser remembering that `editorial_review` is not content. The absence of a public renderer is useful but weak: a future article projection, public JSON endpoint, table-of-contents manifest, or generated section update could accidentally include the field because there is no explicit editor-only policy seam.

This overlaps with public read projection work only at one storage seam. The uncovered issue is the end-to-end content-model policy for editor-only sections across schema, dev UI, public display, generators, and import paths.

## Proposed deepening opportunity

Create an editorial review visibility policy Module or add an explicit editor-only facet to the content-model section manifest. Its Interface should answer:

- whether `editorial_review` is allowed in editor reads, public reads, batch inputs, generated outputs, exports, and import/prepopulate transforms
- how missing review status is defaulted for editor workflows
- which projection Adapters must strip or reject it
- which update modes are allowed to mutate it

The Implementation should make `editorial_review` a first-class editor-only section with no public renderer Adapter and no public table-of-contents entry. Public Convex read Adapters, public route view models, batch/prepopulate workflows, and YAML section updates should call through the policy instead of relying on omission by habit.

## Benefits

- **Module**: editor-only content-model policy becomes a named Module instead of a comment and several negative assumptions.
- **Interface**: callers ask whether `editorial_review` is allowed in a given mode rather than carrying public/editor visibility rules themselves.
- **Implementation**: default status, allowed write modes, stripping, and diagnostics stay together.
- **Depth**: one compact policy Interface protects many public and data-operation paths.
- **Seam**: public projection and editor projection split at a visible seam where editor-only fields can be stripped or rejected.
- **Adapter**: Convex reads, dev form reads, YAML parser output, batch inputs, and export/import scripts become Adapters governed by the same policy.
- **Leverage**: future editor-only metadata fields can reuse the same visibility contract.
- **Locality**: accidental public exposure or generated overwrite of review metadata is caught in policy tests instead of by manual route audit.

## Test plan

- Add policy tests for public read, editor read, generated update, batch, prepopulate, export, and import modes.
- Add projection tests proving public substance projections do not include `editorial_review` while editor projections preserve it.
- Add generated-section tests proving ordinary generated content cannot mutate `editorial_review`.
- Add dev tests proving missing review data defaults to the editor fallback status.
- Run public article smoke tests, dev substance editor tests, and `npm run typecheck`.

## Risk/rollout notes

Introduce this as a non-breaking assertion layer first. Public paths should strip the field rather than fail until all projections are known. Editor and migration paths can warn on unexpected shapes before tightening. Keep the existing schema field and Convex storage compatibility; this task is about explicit visibility policy, not removing stored metadata.
