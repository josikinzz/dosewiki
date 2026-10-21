# Translation workbench

The `/dev/glossary` workbench separates terminology review, exact UI wording,
source coverage, and publication evidence. Its locale capability is independent
of the editor role. Every read and write checks the assigned locale on the server.

## Layout: Terms, Waiting, Suggestions, Interface text, Articles, Style guide

One tab strip, **Workbench view**, sits under a labeled **Language** picker
that names each language in its own script (for example "Deutsch (German)");
a Translator with one assigned language sees it as a fact rather than a
picker. Its six tabs, in order, are **Terms**, **Waiting**, **Suggestions**,
**Interface text**, **Articles**, and **Style guide** (`workbenchSections.tsx`).
They map onto four internal views: **Terms**, **Interface text**, and **Style
guide** are the Words view's lists (`terms`, `labels`, `style`), **Waiting** is
the Inbox view (`inbox` in links and code), **Suggestions** is the Suggestions
view, and **Articles** is the Pages view.
Tabs carry counts when they are known (items in Waiting and Suggestions, terms
and interface text still needing a person), and every view stays mounted once
opened, so switching never drops typed work.

The workbench opens on Terms unless a deep link (below) names another view.
Terms opens with its categories closed and all review states included.

- **Waiting** is a triage workspace: the items that need a person on the left,
  the item under review on the right with its English, the wording readers
  see, and what the check found, and a decision dock with **Accept**, **Fine
  here**, **Edit** and **Skip** (key caps on each). See
  [Waiting](#waiting). When nothing waits it says **All clear** and
  folds away what it checked.
- **Suggestions** is the queue of what readers of the public glossary suggested
  for this language. Marking one resolved changes no wording. To use a
  suggestion, open its term and edit it there.
- **Terms** starts with the language's review progress: how many terms are
  approved, unreviewed, and live but never checked, with one bar. **Continue
  reviewing** opens the first category (in site order) with work left and
  focuses its first row needing review. When every term is reviewed, the same
  place says what happens next, and an admin gets **Open Runs**. Below it,
  the categories sit in a column (search with `/`, the four review states with
  their counts, a **More** menu with **Export CSV**, **Import CSV**, and
  (admin-only) **Draft missing terms**, then one row per category with its
  progress) and the open category fills the pane beside it: its name and
  counts, its own **Approve all** and **Confirm all**, and the rows, the
  English on the left and the translation on the right. Opening a category
  closes the previous one. Search lists matching terms across categories, each
  category with its own bulk actions, and says where matches hide when the
  status filter empties it. A dock at the bottom of the pane holds the result
  of a whole-list write (a bulk approval, an import, a draft run) and what is
  running.
- **Interface text** holds the UI labels. It shares the search with Terms, so
  a search carries across both.
- **Articles** has five sections: **Reader** (the article reader, see
  [Substance narrative review](#substance-narrative-review)), **Coverage**
  (per-page coverage and the release evidence import), **Recent changes**
  (recorded automatic changes, grouped by day), and **Reactions** (reactions
  and website readiness). Admins also
  see **Runs** with the latest run's progress and every control that calls
  the model for a whole locale: start the main translation, **Retranslate**
  pending terms, and retry failed pages; their results show in Runs. A
  Translator without admin sees no run controls.
- **Style guide** holds the locale's style guide, with its save actions in a
  dock and its history beside it.

Articles and Waiting show a status line with stored translation counts and run
progress. Terms keeps those operational counts out of the terminology workflow.
The header says how the two saves differ in one line (the tool's own save
sentence), which the write freeze replaces with "Writes are paused." A refused
write reads as the freeze ("Writes are paused, so that was not saved."), and a
revision conflict on a term offers **Load the latest version**, which asks
first when the row holds typed wording and keeps every other row's wording.

One collapsed **Status legend** defines, with the pill each panel shows, the states every panel names: Machine,
Draft, Live, never checked, Human approved, Source changed, and Re-check. Inside
it the workbench says once: "Approved here is not yet deployed; Coverage in
Articles shows what has been released." Panels do not repeat that approval,
compilation, or processing is not publication; the release evidence itself
(the Coverage section's publication status and rendered route evidence, and
website readiness) sits in Articles.

Review history sits in a drawer on each item: **History** on a glossary row, a
UI label, and an open article paragraph.

Glossary wording survives search, category changes, and view changes within
the open workbench, including an **Edit** from Waiting, which opens its place in the
workbench without reloading the page. Unsaved wording retains its original
revision for conflict detection. It does not survive a browser reload, so
leaving or reloading the page with unsaved term or interface text wording asks
first. View, category, search, and
status selections update the URL. `translationCategory` selects a category;
`translationStatus` selects `all`, `draft`, `unchecked`, or `approved`.

The glossary list loads without usage links. **Where it is used** loads source
locations only when opened. `includeUsage=1` explicitly requests the complete
usage payload; normal entry, saves, and progress polls omit that work.

Deep links keep working across the layout change. `translationView=inbox`,
`suggestions`, `words`, and `pages` name the internal views; with `words`, `translationWords=terms`,
`labels`, or `style` opens that list (so `translationWords=style` opens the
style guide). Older values map onto them: `glossary`
(with `translationTerm`) and `labels` (with `translationLabel`) open Terms or
Interface text, searched to the term or label; `narrative`, `coverage`, and
`changes` open Articles, on the Coverage or Recent changes section for the
latter two; `translationReview=article` (with `translationSlug`,
`translationSegment`, `translationVersion`, or `translationNote`) opens the
article reader in Articles. `parseWorkbenchDeepLink` in
`lib/translation/reviewInboxTypes.ts` owns the mapping.

### Words the workbench uses

Translators see one vocabulary. A glossary row's columns are **Term**,
**Type**, **Translation**, **Status**, and **Written by** (Machine, A person,
or Older import). Reviewer names stay in History. The review states are **Unreviewed**
(a saved draft, "Draft (unreviewed)" in the legend), **Live, never checked**,
and **Approved**, and every count uses those words. Languages are named in
their own script with the English name beside it. Model, run, prompt, and
revision numbers stay out of Waiting and the article editor; hovering the
Machine label shows them.

Every field and passage in the language under review carries that language's
`lang` and `dir="auto"`, so spellcheck, screen reader voice, and right-to-left
text follow the translation rather than the English interface. A glossary
definition stays part of its edit button's accessible name. Row results and
page notices are announced through live regions that stay mounted.

## Review and history

Glossary terms and interface text keep drafts and approval apart. On a glossary
row, each state has one main action: an edited row offers **Save and
approve**, which saves the wording as a draft and then approves exactly the
revision that save produced; a clean draft offers **Approve**; live, never
checked wording offers **Confirm**. **Save draft** stays beside it whenever
there is something to save, and Enter only ever saves a draft. After a plain
save, focus stays on that row's **Approve**; after an approval, it moves to the
next row needing review. A row's result is announced on the row itself.
Saving a correction retains the effective approved wording. Approving
requires the revision that the reviewer actually saw. A conflicting update must
be reloaded and reviewed again. Restoring history creates another draft; it never
publishes an old revision immediately.

`translationReviewEntries` holds the latest draft and approved snapshots.
`translationReviewHistory` appends the action, before/after snapshots, actor,
reason, and revision in the same transaction. CSV imports create drafts even
when a CSV status says approved. Machine drafting
cannot overwrite human drafts or reviewed entries. The effective glossary table
continues to supply approved terminology to article translation.

### Correction reasons and the glossary check

The article reader and UI labels editors ask why a correction was made. Save draft
needs one of four reason chips, **Fluency**, **Terminology**, **Accuracy**, or
**Local addition**, plus an optional note. History stores the reason as
`{ kind, note }` (kind `fluency`, `terminology`, `accuracy`, or `local`) in the
`reason` column as a versioned JSON object. Rows written before this change hold
free text and read as `{ kind: "unspecified", note }`. A plain-text reason from
an older caller, such as Accept in Waiting or batch label approval, is still accepted
and stored as plain text. Above the open glossary
category, "Approvals here are recorded as **Terminology** changes" sets the
reason kind (Terminology by default) recorded with every Approve and Confirm
made there, in place of the fixed "Glossary review".

Every correction save runs a glossary check on the server, through the shared
term matcher (`scripts/translation/term-match.mjs`). If the English mentions an
approved term and the correction does not contain its rendering, the save is
refused with `409 GLOSSARY_CONFLICT` and a `conflicts` list naming each term. The
editor runs the same check while the reviewer types and shows, for example,
"This sentence mentions Replication (体验再现). Your wording does not use it."
with two choices:

- **Fine here** adds the term to the save's `glossaryExceptions`. The server
  saves and records the exception in that history row. It applies to that
  segment or label only.
- **Update the glossary** opens a glossary draft prefilled with the term and its
  current rendering. **Save glossary draft** goes through the glossary's own
  draft save (`/api/dev/translation-glossary/edit`). It never approves. The new
  rendering waits in Words like any other draft.

With the Terminology chip chosen, **Propose glossary change** opens the same
draft form for any glossary term the sentence mentions. Batch approval of short
labels does not run the check; its grid has no place to record an exception.

### Glossary review states

Every glossary row is in exactly one of three states. The summary line counts
each one, and each has its own status filter.

- **Draft** (filter *Unreviewed*): a proposed rendering. It reaches no prompt,
  catalog, or public glossary until a person approves that exact revision.
- **Live, never checked**: approved before review tracking existed (projected
  as `legacy_unverified`). The wording is live: it already drives prompts,
  validation, the UI catalog, and the public glossary. **Confirm** records a
  human approval of the wording exactly as it stands, at the revision the
  reviewer saw, with the actor and a reason in review history. To change it
  instead, edit the rendering and **Save draft**; it becomes a draft and the
  live wording stays until the draft is approved.
- **Approved** (human approved): the newest approval in review history matches
  the live wording and its reviewer.

Confirm writes through the same review mutation as Approve: a stale revision
is refused and writes nothing, the shared-rendering check applies, and the
write freeze, locale assignment, and Translator role all hold. Confirming
leaves the wording, the prompt digest, and the retranslation queue unchanged.
Bulk **Confirm all** on a category header names the exact count and terms in a
dialog first. A category header reads, for
example, "3 drafts, 2 never checked"; its **Approve all** approves the drafts
only, and its **Confirm all** confirms the never-checked rows only.

### Waiting

The **Waiting** view lists, in one place, everything in the locale that needs a
person. This first slice checks three things: glossary rows that are live but
never checked, UI labels whose English or context changed after a human
approved them, and article sentences whose approval went stale (own English
changed) or needs a re-check (a neighbouring sentence changed). Stale approvals
come first, then re-checks, then never-checked terms.

Each item shows the English, the wording readers see now, why it is listed,
and **Accept**, **Edit**, **Skip**. Accept calls the existing mutation at the
revision shown: Confirm for a glossary row, or save the live wording as a draft
and approve that revision for a UI label or article sentence. A stale revision
is refused and writes nothing. An item with no live wording (readers see
English) has no Accept; use Edit. Edit opens the item's existing editor through
its deep link. Skip hides the item for this browser session only. Keys: J and K
move, A accepts, E edits, F marks a finding fine here, S skips.

`GET /api/dev/translation-inbox?locale=<code>&offset=<n>&reason=<reason>`
returns one page of 50 items, the total, and the count per reason; `reason`
narrows the list to one reason (the view's reason filter). It is read-only and
has the same Translator access and locale assignment checks as the rest of the
workbench. Waiting is a read model over the review tables and stored
segments; it adds no approval path.

#### What the checks found

Waiting also lists findings from automated checks and readers, in this
order within the whole list:

1. **Rejected, readers see English** (first): the validator refused every
   attempt and no translation is stored, so readers get the English. The item
   names the defects. A rejection that still has an older stored translation
   is not listed, because readers see that translation.
2. The stale approvals and re-checks above.
3. **Disagrees with the glossary**: a stored translation whose English mentions
   an approved term (the shared term matcher, inflections included, scoped by
   the term's kind) and whose target lacks the rendering. One item per
   sentence and term.
4. **English left in**: the validator's `LEFTOVER_LATIN` finding over stored
   zh-Hans targets.
5. Live, never checked glossary rows.
6. **Reader suggestion** (last): new or in-review suggestions from the public
   glossary feedback queue, read through the existing feedback query.

Findings run the validator over stored targets with the coverage inventory's
bounded, batched reads. The scan is cached for at most five minutes and is
rebuilt at once when the approved glossary changes. An article finding's
**Edit** opens the article reader in Articles at that sentence; a glossary finding on
another record kind opens the term; other findings link to the page.

**Fine here** (key F) on a glossary or leftover-English finding records a
`qa-exception` entry in `translationReviewEntries`, with the actor and reason in
`translationReviewHistory`. The key is the locale, the segment hash, the term,
and the revision the reviewer saw: for a glossary finding, the glossary
revision of the approved rendering (when that rendering last changed; a saved
draft or a Confirm does not change it); for leftover English, a digest of the
stored translation. The item stays away until the English (a new hash), the
rendering, or the translation changes. `POST /api/dev/translation-inbox/exception`
refuses a changed revision (409, nothing written), obeys the write freeze
(503), and checks Translator access and locale assignment.

**Resolve** (key A) on a reader suggestion sets its feedback status to
resolved through the existing `/api/glossary-feedback/<id>/status` mutation,
the same one the Suggestions tab uses. To adopt the
reader's wording, use Edit to open the term first.

#### Model fluency suggestions

An admin can press **Review fluency** on the article open in Articles
(`POST /api/dev/translation-fluency { locale, slug }`, admin only, one article
per request). The model reads the article's English beside the wording readers
see now, section by section (at most 12 requests of about 8,000 characters),
and returns local edits: paragraph, current wording, suggested wording, reason.
Paragraphs whose human approval applies are not sent. Each edit must quote a
span that occurs once, pass the blocking validator, add no number the current
wording lacks, and keep every approved glossary rendering its English mentions
(the correction check in `lib/translation/glossaryConflicts.ts`); anything else
is dropped and counted in the run summary. A second request for the same
article while one runs is refused (409). The write freeze fails closed (503)
before any model request. Requests go through the pipeline's provider client
and the pool's `review` share.

Suggestions are stored as drafts in `translationReviewEntries` under scope
`model-suggestion`, each carrying the model, run id, prompt version, and the
token use of its request; the `run:<slug>` entry's history records every run's
summary. They are listed as **Model fluency suggestion** after the QA
findings. A suggestion expires, and leaves Waiting, when the sentence's
English or the wording readers see changes. **Accept as draft**
(`POST /api/dev/translation-inbox/suggestion`, Translator and up) saves the
suggested sentence as a narrative draft with reason `{ kind: "fluency" }` and
marks the suggestion resolved in one transaction. It never approves: the draft
waits in Articles. An open correction draft on that sentence, an expired
suggestion, or a changed revision is refused (409).

The prompt includes the locale's approved style guide: its rules and up to five
examples chosen against the article's English, as in the translation prompt.
Drafts never reach it.

Recent changes in Articles reads `translationSegmentHistory`. Automatic article and
gallery replacements retain their previous and next segment snapshots in the
same transaction as the translation write. Entries include their English source,
model, prompt version, time, and links to current source records using that hash.
Those links describe current usage, not an invented historical publication
record. Existing translations acquire history when next changed; earlier
versions cannot be reconstructed retroactively.

Recent changes exports the displayed history page as JSON for recovery and
review. Automatic segment history has no one-click restore action in this
release; restoring that content requires a separately reviewed correction.
Glossary and UI label history support restoration directly as a new draft.

## Contextual UI wording

`src/i18n/uiMessageDefinitions.ts` names contexts that must not share a rendering.
For example, `appearance.light` is independent of the dosage label `Light`.
The complete source inventory is generated by `scripts/translation/ui-catalog.ts`
into `src/i18n/uiWorkbenchInventory.generated.json`. Uncategorized entries retain
source-derived legacy IDs until a meaning-specific definition is introduced.
The large inventory is server-only; it does not enter the public client helpers.

The UI labels list shows compiled wording separately from human approval.
Compilation is not evidence that that wording is deployed. Approved UI overrides
are tied to the current source and context. Source changes require a new review.
The compiler uses human-approved UI wording first, applicable approved glossary
terms second, then existing machine translations and baseline seeds. Existing
machine UI prose that disagrees with current glossary terms enters targeted
refresh during online compilation. Human overrides remain authoritative.
Drafts do not enter the compiled catalog.

### Waiting for glossary refresh

The compiler checks every longer UI string against the approved glossary with
the shared term matcher, so "Back to replications" and "Tutorials and resources
for replicating ..." both mention Replication. A string whose compiled wording
lacks the approved rendering (返回复现 while Replication is 体验再现) keeps its
wording and enters `pendingRefresh` in `src/i18n/catalogPublication.json`, one
entry per key naming the `term` and `expectedTarget` behind it. A human-approved
UI override is never queued, even when it keeps the old rendering on purpose.

The **Waiting for glossary refresh** mode of the UI labels list lists those
strings with their current wording, term, and approved rendering. **Review**
opens a string in the one-at-a-time view, where approving the current wording
takes it off the list. An online catalog build sends every waiting entry to the
model and records the list as refreshed. An offline compile cannot refresh:
it keeps the previous list, adds what its baseline terminology finds, and records
`pendingRefreshStatus: "not-refreshed"`, which the view states. Records compiled
before terms were recorded list bare keys; the view takes their term from
`qaGlossaryMisses` and shows "Not recorded" when none names the key. Leaving the
list requires an online build and a deployment; the list is not evidence of
either.

### Short labels

The **Short labels** mode of the UI labels list lists labels of three words or
fewer that are not yet approved, as a dense grid grouped by the first file that
uses them. Tick the rows that read right in context, edit any wording inline,
and press **Approve selected**. Longer strings keep the one-at-a-time card.

`POST /api/dev/translation-workbench/approve-many` takes
`{ locale, items: [{ id, expectedRevision, target }] }`, at most 200 items per
request, and returns one result per item. Each label runs the existing per-label
path in its own transaction: it saves the shown wording as a draft unless that
exact human draft is already saved, then approves that revision. History records
the reviewer and the reason "Batch reviewed in context" for each label. A stale
revision, a validation failure, or a longer label fails only its own row; the
other rows stay approved. The write freeze refuses the whole request. The grid
asks for confirmation, stating the count, before approving more than 200 rows,
and sends larger selections in chunks of 200.

Local deterministic regeneration without database or model access:

```sh
bun run translate:ui -- --offline --write
```

Offline regeneration preserves prior catalog keys and marks the artifact
`offline-unverified`. It cannot incorporate new database approvals or live Copy
Studio content. A release requires the normal Postgres-backed catalog build with
`--live-copy --write`, using the current locale and approved database source.
Online reads require `--target` or `TARGET_POSTGRES_URL`; a non-loopback target
also requires `--allow-remote` and `POSTGRES_IMPORT_CONFIRM` matching its host.
The operator command does not select an ambient application connection.
Do not replace a reviewed production catalog with an offline artifact and claim
that new human corrections were incorporated.

Exact contextual labels can use the blocking `EXACT_TRANSLATION_MISMATCH` check.
Prose glossary misses remain review findings because a contextual rendering is
not necessarily wrong. The miss check uses the same term matcher as the prompt,
so plural and inflected English forms of a term count as mentions. Number, citation, markup, and placeholder
integrity checks continue to apply. Automated QA does not certify linguistic
or medical accuracy.

## Coverage and propagation

Coverage (a section of Articles) runs on demand. It inventories all six published record kinds and the
current UI source inventory. The source traversal is cached for at most five
minutes; the response includes its timestamp. It counts never-stored segments,
stale translations, recorded rejections, and glossary disagreements. Article
counts use occurrences per record; deduplicated hashes are storage identities.
Affected-page lists are bounded and disclose their total.

Queue counts describe processing separately from source coverage. Enqueueing
records stamps a request time, never a completion time. A new glossary change
made during enqueueing remains pending. Old `retranslated_at` stamps are not
accepted as completion evidence because earlier code stamped them at enqueue.

Scoped retranslation refreshes records that mention the requested terms. It no
longer marks unrelated old prompt digests current without proof. Consequently,
other records can remain conservatively stale after a glossary change. Use the
existing full translation enqueue flow to refresh those records. A future
optimization may record per-unit prompt dependencies; the current implementation
does not assume that unrecorded dependencies are unchanged.

Attribution names, identifiers, URLs, canonical numbers, and explicitly excluded
record fields are not translated. Inventory coverage is distinct from rendered
coverage: route wiring, interactive controls, and cached deployed pages need
browser verification. Missing catalog keys continue to fall back to English.

## Release order and evidence

1. Review and apply additive migrations
   `0020_translation_review_workspace.sql` through the existing guarded
   `postgres:migrate` workflow, first rehearsing against an isolated target.
   They add review and segment-history tables plus `retranslation_requested_at`.
   Schema deployment needs the separate production authority in
   [data credentials](../operations/data-credentials.md).
2. Release the editor code. Review corrections and approve exact revisions.
3. Build the catalog from current approved database data, inspect the diff and
   QA output, then release the public artifact through the existing deployment
   workflow. Enqueue and monitor affected article translations separately.
4. Run the store and rendered coverage lenses in
   [locale mirrors](../operations/locale-mirrors.md), and check the reported public controls:

```sh
bun run translate:verify-release -- --locale zh-Hans --paths /,/replications
```

The release check is read-only. It opens the appearance control, checks the exact
light/dark and gallery labels, and compares the rendered catalog digest with the
local compiled artifact. It writes timestamped evidence under `runs/translation`.
`--base=http://localhost:<port>` selects an isolated preview; the server must
serve the locale at the supplied paths. Its success proves only the specified
rendered surfaces and artifact identity, not every page or translation fidelity.

Keep the additive schema on application rollback. Restore a historical rendering
through a new reviewed draft and rebuild/release the catalog as appropriate.
Do not delete recovery history to roll back a translation.

## Acceptance checks

- Appearance Light and dose Light resolve independently.
- Approved terminology replaces older machine UI wording; human overrides win.
- All inventoried UI entries can be searched and reviewed without rendering the
  entire inventory as inputs at once.
- Draft edits, imported CSV status, and history restoration never imply approval.
- Stale revision, wrong locale, cross-origin mutation, and frozen writes fail.
- Counts include missing source units and never equate an empty queue with
  complete translation, human review, or deployment.
- Actual SQL tests cover draft, approve, conflict, restore, rollback, and retained
  effective glossary wording, queue generation races, and segment history.
  Browser tests cover the reviewer interactions.

Cantonese activation is outside this release. Choose written language and script
with its reviewers before adding a locale; script conversion alone is not a new
language translation.

## Substance narrative review

The article reader in Articles shows one public substance article side by side. Find article
searches substance titles and aliases in the public search manifests for English
and, for a UI locale, the reviewed locale; **Article slug** with **Open article** remains as an exact fallback.
English and the wording a reader sees now sit in two columns, paragraph by
paragraph, and stack as pairs below 768px. Each translated paragraph carries one
mark: Machine, Draft, Human approved, Re-check: nearby English changed, or Source
changed. The header reads "N of M paragraphs human approved", counted by the read
response from approvals whose overlay decision is `apply`; a re-check paragraph
still shows the human wording but is not counted. Clicking a translated paragraph opens its
correction editor in place and focuses it. The URL records `translationSlug`, and
for an open paragraph `translationSegment` and `translationVersion`, so a link
reopens that paragraph; a link to an older source version shows the refreshed text
without opening the editor. Save draft, Approve saved draft,
and Restore as draft use the same locale capability and revision history as the
other workbench scopes. The initial HTTP surface accepts `article` only; other
record kinds and independently produced publication indexes need separate rollout
verification before they are enabled.

Human corrections use scope `narrative` in the existing review tables. Their
identity includes canonical record, field/span, exact source, an own-source hash,
and a separate neighbour version covering the other segments in the same field
group. The reader overlays only applicable approvals over machine targets, and
each approval gets one overlay decision: `apply`, `apply-recheck`, or `stale`.
A machine refresh cannot overwrite a correction. Changing the approved sentence
makes its approval stale. Changing only a neighbouring sentence keeps the approval
on the page as `apply-recheck`, shown in the reader's state marks as
"Re-check: nearby English changed"; a re-check approval does not count as
reviewed until someone saves and approves it again. Approvals stored before this
split carry the old whole-group fingerprint and go stale on any change in their
field group until their next approval. Shared English in another record does not
inherit a correction.
The public article notice reads page review state from the same overlay at
render, cached with the page: when every paragraph (segment) of a substance
article has an `apply` approval, the machine-translation notice becomes the quiet
line "人工审校 · date" with the latest approval date and the English link; a
partly reviewed article keeps the notice and adds "N of M paragraphs reviewed".
`apply-recheck` and `stale` count as not reviewed. Reviewer names never appear.
Approval returns cache publication receipts; failed propagation remains distinct
from a successful saved approval. Verify the public result before claiming delivery.

### Translator's notes

Under the last paragraph of each article body section (Dosage & Duration
through Legality) the reader offers **Add translator's note**. A note is short
text for local readers, written in the locale only; it is never a translation
of English. It uses scope `note` in the review tables, one entry per locale,
article, and section anchor (the public section id, such as `history-culture`),
with the same **Save draft**, **Approve saved draft**, and **Restore as
draft** history, revision check, write freeze, and locale assignment as
corrections. Approval runs the blocking validators against an empty English
source, so doubled punctuation, script leaks, citation markers, links, and
placeholders are refused; a Simplified Chinese note must contain Chinese.

`GET /api/dev/translation-note?locale=<code>&kind=article&slug=<slug>` lists
the present sections and any orphaned notes; `POST` takes
`{ locale, kind, slug, section, expectedRevision, action, body?, reason, restoreRevision? }`.
An approval publishes the article's locale cache like a correction.

Readers of the localized article see an approved note at the end of its section
in a box labelled "译者注" (catalog messages `article.translatorNote.label` and
`article.translatorNote.disclaimer`) that says the note is not in the English
original. Drafts never render. The English page is unchanged, and no prompt,
glossary, or other locale reads this scope. A section counts as present by the
same rule as the public table of contents. When a section leaves the English
article its note is orphaned: it stops rendering, the reader shows it without an
editor, and Waiting lists it as "Note's section removed" with Edit only. If
the section returns, the note shows again. There is no delete action yet.

### Style guide

The **Style guide** list under Words holds each locale's rules and example corrections for
the translation prompt. It is one document per locale in scope `style-guide` of
the review tables: `rules` (one per line, at most 40) and `examples`
(`{ before, after, why }`, with the English they translate when known). The
whole document goes through **Save draft**, **Approve saved draft**, and
**Restore as draft** with the revision check, write freeze, and locale
assignment. Drafting and approving both need Translator access to that locale.

In the article reader, a saved correction whose reason is **Fluency** shows
**Promote to style guide** in its review history. It appends the correction to
the style guide draft as an example: before is the wording it replaced (the
earlier draft or approval, else the machine target), after is the corrected
wording, and why is the correction's note. A correction is promoted once.
Promotion never approves; the draft waits in the Style guide list under Words.

Only the approved document reaches prompts. `loadTranslationContext` (and
`translate:locale`) load it beside the approved glossary, and
`buildBatchPrompt` prints every approved rule and up to five examples. Examples
are chosen per batch in a fixed order: the most words shared with the batch's
English (through the shared term matcher, so inflections count), then the most
recent, then id, within a 2,400-character cap
(`scripts/translation/style-guide.mjs`). The approved revision, a digest of the
approved document, joins `promptVersionFor`. Approving a change therefore makes
stored translations read as stale, but it enqueues nothing; a later run or
retranslation picks it up. A draft changes neither the prompt nor the digest,
and a locale with no approved guide keeps its previous digest.

`GET /api/dev/translation-style-guide?locale=<code>[&history=1]` returns
`{ revision, draft, approved, approvedRevision, history? }`; `POST` takes
`{ locale, action, expectedRevision, guide?, reason, restoreRevision? }`, or
`{ locale, action: "promote", correction: { kind: "article", slug, segment, revision } }`.

Coverage can import a bounded `translate:verify-release` JSON report and export a
combined snapshot. It shows unique source hashes separately from per-record units,
retains observation targets and dates, and marks unvisited routes unverified. An
imported passing sample is not a live quality certificate. The source inventory,
UI catalog, human approvals, queue state and public delivery remain separate facts.

`bun run translate:evaluation-candidates --locale=zh-Hans --out=runs/translation/candidates.json`
creates a bounded, unreviewed packet. It requires `TARGET_POSTGRES_URL`,
`DATA_WRITES_FROZEN=1`, and the standard remote-target confirmation when applicable.
Existing output files are never overwritten. Reviewers must add clean examples,
adjudicate targets and assign the held-out split before using it for evaluation.
