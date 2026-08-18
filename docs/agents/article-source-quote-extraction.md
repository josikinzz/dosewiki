# Article-source quote extraction contract

This is the shared current contract for the seven `.cursor/commands/*.md` quote-extraction adapters. The adapter supplies the family, inclusion rules, exclusions, title, and output filename. This file supplies source access, exhaustive reading, verbatim output, and completion.

## Inputs and source access

Work on one named substance slug and one adapter at a time. Article-source documents live in the production Convex deployment `glad-minnow-656` and require the scoped `articleSourceMigration` credential.

```bash
SLUG=lsd
: "${CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION:?Set the scoped article-source read token}"
SOURCE_JSON="${TMPDIR:-/tmp}/${SLUG}-article-sources.json"
bunx convex run --deployment glad-minnow-656 articleSources:getBySlug \
  "{\"slug\":\"${SLUG}\",\"apiKey\":\"${CONVEX_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION}\"}" \
  > "$SOURCE_JSON"
```

The query result is the source of truth for this run. It contains a `sources` array and a `contents` object keyed by source `id`. A `null` result means that the slug has no article-source document; report that condition instead of inventing source content.

## Exhaustive-read criterion

Inventory the `sources` array in its returned order. For every source entry, account for its `id` exactly once. Read the complete `contents[id]` value from first character to last before deciding whether it matches the adapter. An adapter exclusion is accounted for once as `excluded` and its content is not evaluated. Completion requires a one-to-one match between the source inventory and the output sections: no missing IDs, duplicate IDs, or unclassified sources.

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

- The Convex command names deployment `glad-minnow-656`.
- Output section count equals `sources.length`, and each returned source `id` occurs once.
- Every eligible source was read completely; every exclusion is named by the adapter.
- Matches are verbatim, and every eligible zero-match source has the explicit empty-result sentence.
- The file is under `quotes/<family>-quotes/` at the adapter's exact path.
