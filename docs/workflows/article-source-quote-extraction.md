# Article-source quote extraction contract

This is the shared contract for the per-section quote-extraction adapters (intro text, pharmacology, dosage and duration, subjective effects, tolerance, history and culture, legality). An adapter supplies the family, inclusion rules, exclusions, title, and output filename. This file supplies source access, exhaustive reading, verbatim output, and completion.

## Inputs and source access

Work on one named substance slug and one adapter at a time. Before any remote read, follow [data credentials](../operations/data-credentials.md). Read production article-source documents through `createDataClient()` from `scripts/lib/data-client.ts` using the scoped `articleSourceMigration` intent (`DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION`). The central ceremony owns target selection, remote guards, credential loading and read authorization; this adapter grants no mutation capability.

The query result is the source of truth for this run. It contains a `sources` array and a `contents` object keyed by source `id`. A `null` result means that the slug has no article-source document; report that condition instead of inventing source content.

## Exhaustive-read criterion

Inventory the `sources` array in its returned order. Account for every `id` exactly once. Apply the adapter's explicit exclusions first and record each as `excluded` without evaluating its content. For every eligible source, read the complete `contents[id]` value from first character to last before deciding whether it contains matching material. Completion requires a one-to-one match between inventory and output sections: no missing IDs, duplicate IDs, or unclassified sources.

## Extraction and output

1. Apply only the selected adapter's inclusion and exclusion rules.
2. Copy matching text verbatim. Preserve wording, headings, lists, tables, units, warnings, qualifications, and surrounding context needed to retain meaning.
3. Begin the document with `# <adapter title>`, then write one section for every source in source order:

   ```markdown
   ## Source: {displayName} (`{id}`)

   [verbatim matching text]
   ```

   When a complete read finds no matching text, use `_No {family} content found after complete source read._`. For an adapter exclusion, use `_Excluded by the {family} adapter._`.
4. Write the finished document to `quotes/<family>-quotes/<adapter filename>`. Create that family directory when needed.

Search may help navigate a value, but the completed full-value read and one-source/one-section reconciliation are the acceptance checks.

## Completion check

- The read used the explicitly authorized Postgres target and scoped intent under the credential contract.
- Output section count equals `sources.length`, and each returned source `id` occurs once.
- Every eligible source was read completely; every exclusion is named by the adapter.
- Matches are verbatim, and every eligible zero-match source has the explicit empty-result sentence.
- The file is under `quotes/<family>-quotes/` at the adapter's exact path.
