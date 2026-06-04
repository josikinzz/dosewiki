# PROTOTYPE: Citation-Only Marker Workflow

## Question

Does the section-first, marker-only validation model stay simple when section
workers pass, fail, repair, archive, and then feed a final article-wide pass?

## How To Run

```bash
npm run prototype:citation-marker-workflow
```

For a non-interactive trace:

```bash
npm run prototype:citation-marker-workflow -- --demo
```

## What To Look For

- A valid section worker can place citations mid-sentence or at sentence ends.
- A worker that rewrites article text fails even if it added a plausible marker.
- A repair attempt can preserve the useful marker while restoring exact text.
- Failed artifacts can be archived without entering accepted public output.
- The article-wide pass sees accepted section citations and the original citable
  surface, not invalid failed candidate text.
- Excluded sections cannot be packetized for this workflow.

## Provisional Answer

The model looks small enough to implement as a deep module: packet building,
marker-only validation, result merging, and failure archiving can stay separate
from the worker orchestration. The important implementation decision to keep is
that failed candidate text must never become article-wide context; the article-
wide pass should see accepted marked text where available and original citable
text otherwise.

Delete this prototype or lift the pure validation/packet concepts into the real
workflow once issue #4 and issue #5 are underway.
