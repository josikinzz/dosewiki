# Generated Section Update Contract

Generated or imported substance section content should pass through
`src/lib/article/generatedSectionUpdate.ts` before it mutates an article.

The module accepts the current `SubstanceArticle`, a generated section key, a
source adapter (`generated_yaml`, `normalized`, or `parsed_source`), and an
update mode (`preview`, `editor_apply`, `batch_apply`, or `prepopulate_apply`).
It returns a patch, the next article, changed fields, skipped fields, touched
sections, and diagnostics.

The contract owns wrapper parsing, empty defaults, section validation, legacy
harm-potential LD50 normalization, legality country preservation, and
pharmacology route side effects into dosage and duration. Generated section
updates skip `editorial_review`; that field remains editor-only metadata.

Dev form handlers should apply the returned patch through React Hook Form.
Batch and prepopulate workflows should adapt their source data into this
contract before handing patches to their existing persistence paths.
