# Generated Section Update Contract

**Status:** Implemented as a tested boundary; not adopted by production callers.

`buildGeneratedSectionUpdate` in `src/lib/article/generatedSectionUpdate.ts` has
contract tests in `src/lib/article/generatedSectionUpdate.test.ts`, but no
production or script caller imports it. Dev form, generated/imported, batch,
and prepopulate workflows do not yet share this boundary.

The function accepts the current `SubstanceArticle`, a generated section key, a
source adapter (`generated_yaml`, `normalized`, or `parsed_source`), and an
update mode (`preview`, `editor_apply`, `batch_apply`, or
`prepopulate_apply`). Its result includes the patch, next article,
`changedFields`, `preservedFields`, `skippedFields`, touched sections, and
diagnostics. `preservedFields` is currently always empty.

Adoption is complete only when every applicable dev, generated/imported, batch,
and prepopulate mutation caller uses this boundary, the parallel mutation paths
are removed, and `preservedFields` reports the values the boundary intentionally
retains. Until then, this document describes a candidate shared contract rather
than a live workflow guarantee.
