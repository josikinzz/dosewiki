# Citation Workflow Context

This context names the domain concepts used by the dose.wiki citation workflow. It exists to keep citation scope, worker responsibility, and article-safety language precise.

## Language

**Citable Article Surface**:
The subset of a substance article that the claim-level citation workflow may ask workers to cite. For the current workflow, it is exactly `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`.
_Avoid_: whole article, all sections, generated citation scope

**Excluded Citation Surface**:
The substance article fields intentionally left out of the claim-level citation workflow because they have separate provenance or later workflows. For the current workflow, it is `dosage`, `duration`, `subjective_effects`, `comparisons`, `reagent_testing`, `interactions`, `identification`, and `classification`.
_Avoid_: uncitable content, ignored article content

**Citable Article Packet**:
The article-shaped input given to the article-wide citation worker, containing only the citable article surface and omitting excluded citation surface fields without extra explanation text.
_Avoid_: source brief, whole article, filtered summary

**Section Citation Packet**:
The input given to a section citation worker, containing the full top-level section it owns and no unrelated article sections. A legality worker sees all of `legality`, while a harm-potential worker sees all of `harm_potential`.
_Avoid_: subsection packet, read-only article context

**Article-Wide Citation Pass**:
The final citation worker pass over the citable article packet after section citation workers have inserted their citations. It may directly insert additional citation markers in citable fields, and it looks for missing opportunities, duplicate work, and article-level gaps instead of competing with section workers from a blank state.
_Avoid_: parallel broad worker, whole-article generation

**Parallel Section Pass**:
The first citation-worker stage where one worker per included top-level section runs independently because each owns a separate section citation packet. The article-wide citation pass runs only after these section outputs have been validated, repaired where possible, and merged.
_Avoid_: sequential section bottleneck, competing broad-first pass

**Six-Section Status Gate**:
The required pre-article-wide checkpoint for full citation runs. Claude launches section workers in batches of at most 3, verifies visible/active worker labels and output paths against every non-empty citable section, then records `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality` as `checked`, `missing_preserve_original`, or `failed_preserve_original`. Existing outputs must pass worker-output checks; missing outputs, including `legality`, are warnings only when the original section is preserved exactly and no public markers are added there.
_Avoid_: silent missing legality, unchecked section output, partial section batch without status

**Article-Wide Output Guard**:
The rule that an article-wide output is failed when accepted section work exists but `article-wide.json` is a 156-byte stub, has empty `markedSections`/`references`/`evidence`, has markers with zero references/evidence, has evidence rows missing `status`, or has marker/evidence mismatches. The worker should wait for stable size/mtime, then repair or rerun instead of treating the pass as a no-op.
_Avoid_: empty no-op article-wide pass, partial broad-pass failure, mid-write stub acceptance

**Supported Public Marker**:
A public `[cite:reference-id]` marker that resolves to a structured reference and has at least one evidence record with an inspected-source support quote plus a short rationale explaining what the source supports.
_Avoid_: decorative citation, reference-only marker

**Citation Evidence Trail**:
The internal audit record behind public citation markers, including marker/reference identity, inspected-source quote, rationale, worker/pass origin, gaps, and validation outcomes. It supports review and repair but should not constrain marker placement through hard-coded claim mappings.
_Avoid_: placement driver, public article prose

**Citation Draft**:
The run-local `citation-draft.json` artifact that collects marked article/section output, Wikipedia-style references, evidence trail, validation results, gaps, and report data. It should not imply a hard-coded article patch mapping layer.
_Avoid_: patch-only draft, claim placement map

**Citation Review Report**:
The concise human-facing run summary, emphasizing citations added by section, new references, failed sections, gaps, paywall/inaccessible issues, supplemental references, and validation status. Detailed source and evidence data belongs in archive artifacts.
_Avoid_: full evidence transcript, giant source dump

**Brief Support Quote**:
A short contiguous source excerpt kept in the citation evidence trail, following Wikipedia's minimal-use approach to quotations. It should include only enough source text to verify the supported claim, not large source passages.
_Avoid_: full source copy, long excerpt, quote padding

**Accessible Citation Source**:
A source whose claim-supporting text can be inspected without paywall access. The workflow should avoid public citations to paywalled or inaccessible sources when an accessible Wikipedia-grade source can support the claim.
_Avoid_: paywalled public citation, metadata-only support

**Accessible Equivalent Source**:
An accessible Wikipedia-grade source that supports the same claim as a paywalled or inaccessible Wikipedia reference. Workers should look for accessible equivalents before leaving a claim uncited.
_Avoid_: paywall dead end, abstract-only substitute

**Wikipedia-Style Reference**:
A structured reference modeled after common Wikipedia citation-template fields such as cite journal, cite web, cite book, and cite report. The article text may still use internal `[cite:reference-id]` markers, but stored reference metadata and public rendering should follow Wikipedia-style conventions rather than APA.
_Avoid_: APA reference, bibliography-only citation

**Wikipedia-Style Reference Display**:
The public rendering of structured references with richer source details similar to Wikipedia references, adapted to dose.wiki's visual design rather than copied visually.
_Avoid_: APA-only list, bare link list

**Reference Display Follow-Up**:
The later UI work that improves public reference rendering after the Wikipedia-style reference metadata and citation workflow are stable.
_Avoid_: blocking workflow redesign on UI polish

**Canonical Reference Identity**:
The final deduped identity for a source after merging worker outputs. Equivalent references should collapse by DOI, PMID, ISBN, URL, or normalized title, and citation markers should be remapped to the canonical reference ID.
_Avoid_: duplicate reference IDs, worker-local source identity

**Page-Specific Source Identity**:
A worker-chosen source/reference ID that distinguishes same-site pages before canonical merging. DailyMed labels, for example, should include setid, label name, or another page-specific suffix rather than a generic `dailymed` ID.
_Avoid_: site-only ID, collapsed same-site pages

**Discovery-Only Wiki Source**:
A wiki page used to find candidate claims, references, or article structure, but not accepted as a final claim-level citation. Wikipedia, PsychonautWiki, and similar article pages belong in article links or see-also surfaces rather than public references.
_Avoid_: wiki citation, secondary wiki reference

**Wikipedia-Grade Source**:
An underlying source suitable for a Wikipedia reference, such as a peer-reviewed paper, review article, book, government or regulatory document, reputable database, or other authoritative non-wiki source. It does not have to be primary literature when a review or official document is the more appropriate source.
_Avoid_: primary source as a blanket rule, wiki page as a reference

**Wikipedia Reference Pool**:
The set of underlying references extracted from the equivalent Wikipedia article for a substance. It is the default source pool for claim-level citation work, with extra research used only when that pool is missing, inaccessible, or insufficient for dose.wiki claims.
_Avoid_: arbitrary web search pool, Wikipedia page citation

**Supplemental Reference**:
A Wikipedia-grade source found outside the equivalent Wikipedia article's reference pool. Workers may add one only for high-confidence citation gaps after first attempting to integrate relevant Wikipedia references.
_Avoid_: casual web find, low-confidence add-on source

**DoseWiki-Only Claim**:
A factual claim present in the dose.wiki citable article surface but absent from the equivalent Wikipedia article. It may receive a public marker when a strong Wikipedia-grade source supports it.
_Avoid_: unsupported local claim, forced Wikipedia match

**Citation Gap**:
An internal note that a claim lacked strong enough support for a public marker. Citation gaps do not change article text and must not create public citation-needed markers.
_Avoid_: citation needed marker, weak public citation

**Conservative Citation Coverage**:
The workflow preference for fewer well-supported public markers over more weakly supported markers. Citation workers should not stretch sources merely to raise coverage counts.
_Avoid_: coverage maximization, source stretching

**Wikipedia Citation Density**:
The expected density of public markers should feel like a well-cited Wikipedia article: cite specific claims, clauses, sentences, or compact paragraphs where support is needed without repeating markers noisily.
_Avoid_: one citation per section, citation spam

**Citation Worker Instructions**:
The succinct natural-language guidance that puts Claude into the Wikipedia-style citation mindset for citation runs. The canonical behavior should live where Claude reads it during `/cite`, especially the workbench `CLAUDE.md` and Claude-side worker/skill files, with main-repo docs pointing to that contract rather than duplicating it.
_Avoid_: scattered instruction copies, long ad hoc prompts

**Citation Marker Placement**:
The placement of `[cite:reference-id]` markers inside article text using normal Wikipedia reading conventions, like reference tags in raw MediaWiki/wikitext. Markers may appear mid-sentence, at sentence ends, inside short structured strings, be reused in multiple places, or be adjacent to other markers when multiple references genuinely support the text; they should not interrupt words.
_Avoid_: section-end citation, one-marker-per-reference-only, mid-word marker

**Citation-Only Edit**:
A proposed article change where stripping citation markers restores the original text exactly, including punctuation, capitalization, paragraph breaks, and whitespace.
_Avoid_: normalized rewrite, harmless prose cleanup

**Section Repair Loop**:
A natural-language worker retry for a section that failed citation-only validation. The repair worker compares the original and changed section, removes accidental non-citation edits, and reruns validation so one failed section does not discard an entire citation run.
_Avoid_: whole-run failure, framework-heavy repair pipeline

**Failed Citation Section Artifact**:
A preserved section-worker output that failed validation or repair. It is not applied to the public article, but it stays in the run archive so a later agent can inspect and fix it.
_Avoid_: discarded failed section, silently applied failed section

**Accepted Citation Section**:
A section-worker output that passed citation-only validation and can be merged into the article-shaped packet for the article-wide citation pass.
_Avoid_: unvalidated section draft, failed section body

**Local Citation Run Archive**:
The local preserved output of a citation run, including validated drafts, failed section artifacts, source/evidence records, reports, and the pre-citation article snapshot. Normal runs should accumulate locally until a deliberate promotion batch.
_Avoid_: one-off live write, disposable run output

**Production Rollout Batch**:
A deliberate group of locally archived citation results written to live Convex/site data during the citation production rollout. The existing rollout order is homepage `common` substances first, other homepage-visible substances second, and remaining SubstanceIndex entries third.
_Avoid_: per-drug automatic publish, immediate Convex write

**Citation Rollout Stage Gate**:
A deliberate pause between rollout stages for process review. The planned sequence is: use `2c-b` to perfect the workflow, run homepage common substances, publish/review the common substances, stop, then later scale to other homepage-visible substances.
_Avoid_: continuous production rollout, jumping tiers

**Citation Canary**:
The substance rerun repeatedly to prove and refine citation workflow changes before scaling. `2c-b` is the current citation canary.
_Avoid_: one-and-done pilot

## Example Dialogue

Dev: Should the article-wide citation worker see interactions?

Domain expert: No. Interactions are outside the citable article surface because that section has separate TripSit provenance.

Dev: Should we tell the article-wide worker which fields were excluded?

Domain expert: No. Give it an article-shaped packet with those fields absent so it focuses on the content that needs citations.

Dev: Should the legality worker see just United States scheduling?

Domain expert: No. Legality is in the citable article surface, so the legality worker should see the full `legality` field, including international notes and all countries.

Dev: Should the legality worker also see harm potential for context?

Domain expert: No. Section workers should only see their own full top-level section; the article-wide worker exists for broader context.

Dev: Should the article-wide citation pass run alongside section workers?

Domain expert: No. Run it after section workers so it sees their citation work and can focus on missing coverage.

Dev: Can section citation workers run in parallel?

Domain expert: Yes. Section workers run in parallel, then the article-wide pass reviews their merged work.

Dev: Can article-wide run if one section worker has not produced output?

Domain expert: Yes, but only after the six-section status gate is explicit. If `legality` or another citable section is missing, mark it `missing_preserve_original`, preserve the original section exactly, and add no public markers there. Invalid section output remains a failure.

Dev: What if the article-wide worker writes an empty or partial output even though section workers succeeded?

Domain expert: Treat 156-byte stubs, empty output, markers without references/evidence, missing evidence `status`, and marker/evidence mismatches as failed article-wide passes. Repair or rerun before assembly; do not call the run complete.

Dev: Can a marker be public if the reference exists but no inspected source quote backs it?

Domain expert: No. Public markers need matching evidence records with support quotes.

Dev: Is evidence the main citation output?

Domain expert: No. The article markers and Wikipedia-style references are the main output; evidence is the audit trail.

Dev: Should citation output be modeled as article patches?

Domain expert: No. Keep `citation-draft.json`, but model the output as marked article/section content plus validation and evidence.

Dev: What should the final report show?

Domain expert: A concise review dashboard, with detailed evidence and source artifacts kept separately.

Dev: How much source text should an evidence row keep?

Domain expert: Keep a brief support quote, using only enough contiguous source text to verify the claim.

Dev: Can a paywalled source be used just because Wikipedia cites it?

Domain expert: Avoid paywalled public citations; cite only accessible support, or record a gap.

Dev: What should happen when a Wikipedia reference is paywalled?

Domain expert: Look for an accessible equivalent source first, then leave the claim uncited if no good source is available.

Dev: Should references be stored as APA entries?

Domain expert: No. dose.wiki should use Wikipedia-style reference metadata while keeping internal cite markers stable.

Dev: Should the public source list stay a bare numbered list?

Domain expert: No. It should evolve toward richer Wikipedia-style reference display while matching dose.wiki's aesthetic.

Dev: Should richer reference UI block the workflow rewrite?

Domain expert: No. Stabilize the workflow and metadata first; improve the public display later.

Dev: What if workers create duplicate IDs for the same source?

Domain expert: Dedupe equivalent references and remap markers to the canonical reference identity.

Dev: What if workers cite multiple DailyMed labels?

Domain expert: Give each label a page-specific ID, such as one including setid or label name, so distinct labels do not collapse into one generic DailyMed reference.

Dev: Does Wikipedia-style mean citing Wikipedia?

Domain expert: No. It means using familiar reference metadata conventions; wiki pages are discovery-only for claim-level citation work.

Dev: Do all claim-level references need to be primary literature?

Domain expert: No. They need to be Wikipedia-grade underlying sources: the kinds of sources Wikipedia would cite, not Wikipedia itself.

Dev: Where should citation research start?

Domain expert: Start with the Wikipedia reference pool, then add outside sources only when needed.

Dev: Can workers add sources outside the Wikipedia reference pool?

Domain expert: Yes, but only for high-confidence gaps after prioritizing the Wikipedia reference pool.

Dev: Can a claim absent from Wikipedia still get cited?

Domain expert: Yes, if a strong Wikipedia-grade source supports it. The main focus remains integrating Wikipedia's underlying references.

Dev: Should unsupported claims get public citation-needed tags?

Domain expert: No. Leave the article text alone and optionally record an internal citation gap.

Dev: Should workers maximize citation count?

Domain expert: No. Prefer conservative citation coverage with strong source support.

Dev: Can the same reference marker appear more than once?

Domain expert: Yes. Reuse and adjacent multi-cites should follow normal Wikipedia citation conventions.

Dev: How dense should citations feel?

Domain expert: They should follow Wikipedia citation density and quality expectations.

Dev: Where should the citation style guidance live?

Domain expert: Put it where Claude reads it during the citation session, keep it succinct, and avoid sprawling duplicates.

Dev: Can the citation workflow silently normalize whitespace?

Domain expert: No. If a section changes anything besides citation markers, reject that section and send it through a repair loop.

Dev: What happens if repair still fails?

Domain expert: Preserve the failed section artifact for later review, but do not apply it to the article.

Dev: Should the article-wide pass read failed section bodies?

Domain expert: No. It should see accepted citation sections, with failed section names noted separately if needed.

Dev: Should every validated drug write to production immediately?

Domain expert: No. Store runs locally, archive old article versions, and write citation results during deliberate production rollout batches unless an explicit experiment says otherwise.

Dev: What are the rollout stages?

Domain expert: Perfect the process on 2C-B, run common substances, publish and review commons, then stop before scaling to homepage-visible substances.

Dev: Is 2C-B finished as a citation pilot?

Domain expert: No. 2C-B remains the canary and may be rerun multiple times under new workflow rules.
