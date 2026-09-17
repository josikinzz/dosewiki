# Advisory Review Flags, Human-Only Approval

**Status:** Accepted; implemented.
**Current implementation:** `src/schema/substance/editorial.ts` is the runtime authority for canonical labels and the open 1–3-word label constraint; `scripts/review/export-review-run.ts` and `scripts/review/apply-review-flags.ts` own the executable review workflow.

Article-review findings are stored as review flags: advisory, badge-labeled to-do notes inside each article's editor-only editorial review metadata. Flags never gate anything — an editor may mark an article reviewed with open `major` flags, and no flag state changes visibility or publication. Approval stays exclusively human: the review workflow's write path can only replace agent-sourced flags and is structurally unable to touch review status, so the public `expert_reviewed` claim always traces to a human editor's sign-off in the review workbench.

We chose advisory semantics over a hard or soft approval gate because the editorial record shows reviewers approving imperfect articles deliberately ("skinny but fine, approved"); a gate would pressure editors to delete flags to proceed, destroying the record the flags exist to keep. We chose free-named badge labels (one to three words) constrained by a canonical label list with an escape hatch, rather than a strict enum, so the portal stays filterable on recurring problems while novel findings remain expressible. We chose present-or-deleted flag lifecycle — each review run wholesale replaces agent-sourced flags, human flags persist until deleted — over a resolved/dismissed audit trail, keeping run history in dated run folders instead of the database.

**Consequences**

- An `expert_reviewed` article can carry open flags; the workbench should surface this as visible context, never as enforcement.
- Disagreement with a recurring agent flag is fixed by amending the article-review skill's instructions, not by dismissing the flag (it would return next run).
- "Keep hidden" is a flag label (`consider hiding`) recommending a human visibility decision; it is not a severity and is never acted on automatically.
- Review terminology lives in the [glossary](../glossary.md#article-review-language) Article Review Language section. The runtime canonical label list and validation live in `src/schema/substance/editorial.ts`; the article-review skill mirrors that list for agents.
