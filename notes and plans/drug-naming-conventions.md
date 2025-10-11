# Drug Naming Conventions Playbook

Use this reference whenever we normalize naming fields in `src/data/articles.json`. It explains the intended roles for each field, how to stage bulk updates, and the sanity checks that keep the UI consistent.

## Field Roles
- `title`: Primary display label. Mirror `drug_info.drug_name` when a common name exists; otherwise fall back to `drug_info.chemical_name`.
- `drug_info.drug_name`: Canonical common name (abbreviation, street name, or everyday label). Drives search, card headings, and the index view.
- `drug_info.chemical_name`: Full systematic or formal chemical name. Leave empty if no trusted reference is available.
- `drug_info.alternative_names`: Array of secondary labels (other abbreviations, IUPAC variations, brand names). Omit duplicates of the common name.

## Update Workflow
1. **Capture the request**
   - Gather the authoritative list of substances and their common / chemical / alternative names.
   - Note any entries that intentionally lack a common name (e.g., developmental compounds that should display their chemical name).

2. **Verify dataset coverage**
   - Confirm every requested substance exists in `articles.json`. A quick `node` or `jq` lookup avoids editing mismatched strings.
   - Flag missing entries or alternate spellings before editing.

3. **Plan the mapping**
   - Build a mapping object per record: `{ common, chemical, alternatives[] }`.
   - Decide on fallbacks for empty fields (`common` may be blank; `chemical` should only be blank when no reliable source is supplied).

4. **Script the updates**
   - Iterate the dataset, locate matching articles (prefer exact `drug_name` or prior `title` matches), and assign:
     ```js
     article.title = common ?? chemical ?? article.title;
     article.drug_info.drug_name = common ?? '';
     article.drug_info.chemical_name = chemical ?? '';
     article.drug_info.alternative_names = alternatives ?? [];
     ```
   - Run a second pass to ensure `title` mirrors `drug_name` when `drug_name` is non-empty.

5. **Handle duplicates intentionally**
   - Multiple records can share the same common name (e.g., isomers). Confirm that the UI logic distinguishes them by `id` or context before committing the change.
   - If duplicate titles create confusion, document the exception and keep a distinguishing suffix in `drug_name` until the UI is updated.

6. **Review & validate**
   - Spot-check sampled entries with `jq` queries to confirm all three fields are synchronized.
   - Run `npm run build:inline` after edits; the inline bundle catches malformed JSON and helps manual QA.

## Bulk Update Checklist
- [ ] Request list parsed with common / chemical / alternatives columns.
- [ ] All substances located in `articles.json` (or gaps communicated).
- [ ] Script applies updates using `JSON.stringify(data, null, 2)` for consistent spacing.
- [ ] `title` set to common name or chemical fallback across the set.
- [ ] `alternative_names` deduplicated (no overlaps with `drug_name`).
- [ ] Build succeeds (`npm run build:inline`).

## Sample Node Snippet
```js
const fs = require('fs');
const path = 'src/data/articles.json';
const records = JSON.parse(fs.readFileSync(path, 'utf8'));
const updates = [
  {
    match: ['4-Methylmethcathinone (4-MMC)', 'Mephedrone'],
    common: 'Mephedrone',
    chemical: '4-Methylmethcathinone',
    alternatives: ['4-MMC', 'M-CAT', 'drone', 'meow meow'],
  },
  // …
];

for (const article of records) {
  const info = article.drug_info ?? {};
  const update = updates.find((u) =>
    u.match.some((needle) =>
      [article.title, info.drug_name, info.chemical_name]
        .filter(Boolean)
        .some((value) => value.toLowerCase() === needle.toLowerCase())
    )
  );
  if (!update) continue;

  const { common, chemical, alternatives } = update;
  if (common) {
    info.drug_name = common;
    article.title = common;
  } else if (chemical) {
    article.title = chemical;
  }
  info.chemical_name = chemical ?? '';
  info.alternative_names = alternatives ?? [];
  article.drug_info = info;
}

// Ensure titles mirror the final drug_name/chemical fallback
for (const article of records) {
  const info = article.drug_info ?? {};
  const common = (info.drug_name || '').trim();
  const chemical = (info.chemical_name || '').trim();
  if (common) article.title = common;
  else if (chemical) article.title = chemical;
}

fs.writeFileSync(path, JSON.stringify(records, null, 2));
```

## Edge Cases & Tips
- **Missing common name**: Leave `drug_name` blank and let `title`/UI fall back to `chemical_name`; document the decision.
- **Shared entries**: When two articles should keep distinct titles, leave the differentiating suffix (e.g., “Ketamine – nasal”) until UI logic supports contextual labels.
- **Non-standard spacing**: Normalize strings before comparisons (`trim()`, case-insensitive checks) to avoid partial matches.
- **Audit trail**: Append updates or scripts to `notes and plans/` when a bulk run introduces new conventions so future batches stay aligned.

Following this flow keeps naming fields synchronized, avoids downstream display issues, and makes future metadata enrichments straightforward.
