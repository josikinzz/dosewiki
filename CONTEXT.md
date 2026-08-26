# dose.wiki Domain Context

This glossary defines the canonical language for citation, legality research, article review, and replication surfaces. Execution steps live in the linked workflow documentation.

## Citation Workflow Language

For citation runbooks and artifact contracts, read [Citation Workbench](docs/agents/citation-workbench.md).

**Citable Article Surface**:
The six article fields in claim-level citation scope: `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`.
_Avoid_: whole article, all sections, generated citation scope

**Excluded Citation Surface**:
The article fields outside claim-level citation scope because they have separate provenance or workflows: `dosage`, `duration`, `subjective_effects`, `comparisons`, `reagent_testing`, `interactions`, `identification`, and `classification`.
_Avoid_: uncitable content, ignored article content

**Citable Article Packet**:
An article-shaped input containing only the Citable Article Surface, with excluded fields absent and no explanatory filler.
_Avoid_: source brief, whole article, filtered summary

**Section Citation Packet**:
The complete top-level section owned by one section citation worker, with no unrelated article sections.
_Avoid_: subsection packet, read-only article context

**Article-Wide Citation Pass**:
The final pass over the merged, accepted section work. It may add markers while checking cross-section gaps and duplicate work.
_Avoid_: parallel broad worker, whole-article generation

**Parallel Section Pass**:
The first citation stage: one independent worker owns each included top-level section. Accepted section outputs are merged before the Article-Wide Citation Pass.
_Avoid_: sequential section bottleneck, competing broad-first pass

**Six-Section Status Gate**:
The required checkpoint before an Article-Wide Citation Pass. Every non-empty citable section is recorded as `checked`, `missing_preserve_original`, or `failed_preserve_original`; missing or failed sections preserve the original exactly and receive no public markers.
_Avoid_: silent missing legality, unchecked section output, partial section batch without status

**Article-Wide Output Guard**:
The acceptance rule that article-wide output must contain coherent marked sections, references, and evidence. Empty output, markers without matching references or evidence, evidence without `status`, and marker/evidence mismatches fail the pass and require repair or rerun.
_Avoid_: empty no-op article-wide pass, partial broad-pass failure, mid-write stub acceptance

**Supported Public Marker**:
A public `[cite:reference-id]` marker that resolves to a structured reference and has at least one evidence record with an inspected-source support quote plus a short rationale explaining what the source supports.
_Avoid_: decorative citation, reference-only marker

**Citation Evidence Trail**:
The internal audit record behind public markers: marker and reference identity, inspected-source quote, rationale, pass origin, gaps, and validation outcomes. It supports review and repair but never drives marker placement through hard-coded claim mappings.
_Avoid_: placement driver, public article prose

**Citation Draft**:
The run-local artifact containing marked article content, Wikipedia-style references, the Citation Evidence Trail, validation results, gaps, and report data.
_Avoid_: patch-only draft, claim placement map

**Citation Review Report**:
The concise run summary of citations, new references, failed sections, gaps, inaccessible sources, supplemental references, and validation status. Detailed evidence stays in archived artifacts.
_Avoid_: full evidence transcript, giant source dump

**Brief Support Quote**:
A short contiguous excerpt containing only enough source text to verify the supported claim.
_Avoid_: full source copy, long excerpt, quote padding

**Accessible Citation Source**:
A source whose claim-supporting text can be inspected without paywall access. Prefer it to paywalled or inaccessible support when an accessible Wikipedia-Grade Source supports the claim.
_Avoid_: paywalled public citation, metadata-only support

**Accessible Equivalent Source**:
An accessible Wikipedia-grade source that supports the same claim as a paywalled or inaccessible Wikipedia reference. Workers should look for accessible equivalents before leaving a claim uncited.
_Avoid_: paywall dead end, abstract-only substitute

**Wikipedia-Style Reference**:
A structured reference modeled on Wikipedia citation-template fields such as cite journal, cite web, cite book, and cite report. Stored metadata and public rendering follow these conventions rather than APA, while article text uses stable internal markers.
_Avoid_: APA reference, bibliography-only citation

**Wikipedia-Style Reference Display**:
The public rendering of structured references with Wikipedia-like source detail adapted to dose.wiki's visual design.
_Avoid_: APA-only list, bare link list

**Reference Display Follow-Up**:
The later UI work that improves public reference rendering after the Wikipedia-style reference metadata and citation workflow are stable.
_Avoid_: blocking workflow redesign on UI polish

**Canonical Reference Identity**:
The deduplicated identity of a source after worker outputs merge. Equivalent references collapse by DOI, PMID, ISBN, URL, or normalized title, and their markers resolve to this ID.
_Avoid_: duplicate reference IDs, worker-local source identity

**Page-Specific Source Identity**:
A pre-merge source ID that distinguishes pages on the same site. For example, a DailyMed label ID includes its setid, label name, or another page-specific suffix.
_Avoid_: site-only ID, collapsed same-site pages

**Discovery-Only Wiki Source**:
A wiki page used to find candidate claims, references, or structure but never as a final claim-level citation. It belongs in article-link or see-also surfaces, not public references.
_Avoid_: wiki citation, secondary wiki reference

**Wikipedia-Grade Source**:
An authoritative non-wiki source suitable for a Wikipedia reference, such as a peer-reviewed paper, review, book, government document, regulatory document, or reputable database. Primary literature is not mandatory when a review or official source is better.
_Avoid_: primary source as a blanket rule, wiki page as a reference

**Wikipedia Reference Pool**:
The underlying references from a substance's equivalent Wikipedia article. It is the default claim-level source pool; research expands beyond it only when it is missing, inaccessible, or insufficient.
_Avoid_: arbitrary web search pool, Wikipedia page citation

**Supplemental Reference**:
A Wikipedia-Grade Source outside the Wikipedia Reference Pool, added only for a high-confidence gap after relevant pool sources have been considered.
_Avoid_: casual web find, low-confidence add-on source

**DoseWiki-Only Claim**:
A factual claim in the Citable Article Surface but absent from the equivalent Wikipedia article. It may receive a public marker only when a strong Wikipedia-Grade Source supports it.
_Avoid_: unsupported local claim, forced Wikipedia match

**Citation Gap**:
An internal record that a claim lacked support strong enough for a public marker. It leaves article text unchanged and never creates a public citation-needed marker.
_Avoid_: citation needed marker, weak public citation

**Conservative Citation Coverage**:
The preference for fewer well-supported public markers over greater coverage supported by stretched sources.
_Avoid_: coverage maximization, source stretching

**Wikipedia Citation Density**:
Public-marker density comparable to a well-cited Wikipedia article: support the smallest useful claim, sentence, or compact paragraph without noisy repetition.
_Avoid_: one citation per section, citation spam

**Citation Worker Instructions**:
The concise, canonical guidance loaded during citation runs. Keep the behavior in its workflow-owned skill and workbench files rather than scattered prompt copies.
_Avoid_: scattered instruction copies, long ad hoc prompts

**Citation Marker Placement**:
The position of `[cite:reference-id]` markers under normal Wikipedia reading conventions. Markers may be reused, adjacent when multiple sources support the text, or placed within structured strings, but never inside a word.
_Avoid_: section-end citation, one-marker-per-reference-only, mid-word marker

**Citation-Only Edit**:
A proposed article change where stripping citation markers restores the original text exactly, including punctuation, capitalization, paragraph breaks, and whitespace.
_Avoid_: normalized rewrite, harmless prose cleanup

**Section Repair Loop**:
A retry that restores citation-only output after validation fails, so one invalid section does not discard the run.
_Avoid_: whole-run failure, framework-heavy repair pipeline

**Failed Citation Section Artifact**:
A preserved section output that failed validation or repair. It remains available for later review but is never applied to the public article.
_Avoid_: discarded failed section, silently applied failed section

**Accepted Citation Section**:
A section output that passed citation-only validation and may enter the merged packet for the Article-Wide Citation Pass.
_Avoid_: unvalidated section draft, failed section body

**Local Citation Run Archive**:
The preserved local record of a citation run: drafts, failed section artifacts, evidence, reports, and the pre-citation article snapshot. Runs remain local until a deliberate promotion batch.
_Avoid_: one-off live write, disposable run output

**Production Rollout Batch**:
A deliberate group of locally archived citation results promoted to production together, ordered as homepage `common` substances, other homepage-visible substances, then remaining SubstanceIndex entries.
_Avoid_: per-drug automatic publish, immediate Convex write

**Citation Rollout Stage Gate**:
A deliberate pause between rollout tiers. Calibration on `2c-b` is complete. Publish and review the homepage `common` substances. Then stop before expansion to other homepage-visible substances.
_Avoid_: continuous production rollout, jumping tiers

**Citation Canary**:
A Citation Canary is a substance used for repeated runs that prove and refine workflow changes before scaling. `2c-b` is the completed historical canary. Select the next canary explicitly.
_Avoid_: one-and-done pilot

## Legality Research Language

For legality research and apply steps, read the repo-local [`legality-pi` skill](.agents/skills/legality-pi/SKILL.md).

**Legality Research Run**:
One substance's exported run packet, research output, independent refuter verdicts, and Legality Draft awaiting review.
_Avoid_: citation run, live legality edit

**Cite Pass**:
The research branch that sources existing country entries or proposes a Legality Correction when one is wrong or outdated. It never invents country entries.
_Avoid_: discovery work, entry rewrite pass

**Discovery Pass**:
The research branch that gives every Core Country List member either a sourced entry or a Legality Gap and may add Opportunistic Country Entries. It never changes existing entries.
_Avoid_: correction work, unbounded country sweep

**Core Country List**:
The fixed countries that every Discovery Pass must account for, making coverage comparable and completion checkable.
_Avoid_: whatever Codex finds, per-substance country choice

**Opportunistic Country Entry**:
A country entry outside the Core Country List, allowed only with Primary Legal Source support.
_Avoid_: filler entry, unsourced extra country

**Canonical Legal Status**:
The fixed status value carried by every country entry alongside its Legal Instrument and free-text notes.
_Avoid_: free-string status, ad hoc status phrasing

**Legal Instrument**:
The statute, schedule, regulation, or convention on which a country entry's status rests. Every status claim names its instrument.
_Avoid_: vague legal reference, uncited status

**Primary Legal Source**:
The legal instrument's text or a first-party government publication of it. Wikis, forums, aggregators, and news are discovery pointers, never cited support.
_Avoid_: secondary write-up as support, wiki legality table citation

**Legality Correction**:
A Cite Pass proposal that preserves a wrong or outdated entry beside its sourced replacement for reviewer comparison.
_Avoid_: silent rewrite, flag-only discrepancy note

**Legality Gap**:
A required record that a country was researched without finding a Primary Legal Source, including what was searched. It distinguishes a researched absence from an unresearched country.
_Avoid_: silent omission, guessed status

**Legality Refuter**:
An adversarial verification run in a fresh blank context on the session model. It tries to refute a finding against its cited source. A refuted finding enters bounded recovery before its terminal gap or `draft.refuted` disposition.
_Avoid_: rubber-stamp check, producer reviewing its own finding, unbounded recovery

**Legality Draft**:
The run-local artifact containing verified entries, corrections, International Convention Status, evidence, and gaps for one substance. It reaches Convex only through a dry-run followed by a confirmed write.
_Avoid_: direct Convex write, hand-edited local JSON fix

**Per-Substance Autopilot**:
The post-pilot mode in which each validated draft is dry-run and then applied to production one substance at a time without another human pause. Before the user approves the pilot canaries, every apply stops after dry-run for explicit confirmation.
_Avoid_: unvalidated auto-write, batch bulk apply, pre-pilot autopilot

**International Convention Status**:
A substance's primary-sourced scheduling under the 1961, 1971, and 1988 UN drug conventions, or an explicit “not internationally scheduled” finding.
_Avoid_: empty international section, uncited UN claim

**Common-First Legality Rollout**:
The rollout of publicly listed substances in common-first order: substances marked `common` in each psychoactive category, then every remaining unprocessed substance. Completed runs are skipped. Each substance is published once to production Convex (`glad-minnow-656`). Completion requires `applied.json` and `citations-applied.json` to record successful writes before the next substance begins.
_Avoid_: source-material-priority rollout, rerunning completed substances, bulk publish

## Article Review Language

**Review Flag**:
An advisory to-do attached to an article or section by the review workflow or a human editor. It never gates approval; an article may be Reviewed with open flags.
_Avoid_: blocker, approval gate, review failure

**Flag Severity**:
The size of a flag's to-do: `major` for absent or substantially deficient work, `minor` for a bounded fix, or `note` for an optional improvement. It never controls approval or visibility.
_Avoid_: blocker, unapprovable, keep hidden

**Consider-Hiding Flag**:
An article-level recommendation that a human consider hiding the article from public listings. The review workflow never changes visibility.
_Avoid_: hide severity, auto-hide

**Flag Label**:
The one-to-three-word badge that names a Review Flag. Reuse a canonical article-review label when one fits; put detail in the note.
_Avoid_: flag code, category enum, long badge text

**Review Run**:
One dated review of a chosen article set. It replaces agent-sourced flags for covered articles, preserves human-created flags until human deletion, and keeps history in the dated run folder rather than Convex.
_Avoid_: resolved flag state, dismissed-flag audit trail, incremental agent flag edits

**Reviewed**:
Human sign-off recorded as editorial status `completed` and displayed publicly as `expert_reviewed`. Only a human editor in the review workbench may set it; review agents never do.
_Avoid_: approved, agent-approved, auto-complete

**Lyrea (Witchy)**:
One expert reviewer with public persona **Lyrea** (profile key `LYREA`, route `/contributors/lyrea`) and informal alias **witchy**. Attribution matching is alias-aware; “Lyria” is a mistranscription.
_Avoid_: Lyria, treating Lyrea and Witchy as two people

## Replications Surface Language

The [replication classification field guide](docs/agents/replication-classification-guide.html) is the canonical intake and taxonomy procedure. It keeps gallery admission, viewing mode, effect evidence, title-only drug tags, and artist practice as separate decisions.

**Replication Context**:
Attributable item-level evidence that a source treats media as a replication, including an explicit replication role or an assigned subjective-effect slug. This context establishes gallery admission unless the item is an explicit figure or has a concrete item-specific exclusion.
_Avoid_: pixels-only admission test, synthetic-overlay requirement

**Not-Replication**:
A narrow exclusion for an explicit explanatory figure or a concrete item-specific non-replication. Illustrative effect examples, ordinary-looking media, and traditional psychedelic artwork are not excluded merely because their mechanism needs source context.
_Avoid_: illustrative, visually subtle, not obviously simulated

**Viewing Mode**:
How a replication depicts experience: `open-eye` when a recognizable external-world substrate persists, `closed-eye` when a self-contained imagined field replaces it, and `mixed` only when both materially occur.
_Avoid_: artist category, realism score, gallery-admission status

**Replications Section**:
The public `/replications` destination. It opens directly into the Replication Gallery with Tutorials and Audio tabs plus an external r/replications link.
_Avoid_: replications landing page, gallery tab, SEI gallery

**Replication Gallery**:
The default `/replications` tab, grouping the browsable corpus by artist or effect. Focus uses canonical paths (`/replications/artist/<key>`, `/replications/effect/<slug>`); transient filters use query parameters.
_Avoid_: effects gallery, `/effects#gallery`, unaddressable gallery view

**Gallery Focus View**:
A single-artist or single-effect Replication Gallery projection with its own path. The artist projection is the Artist Page; it is one surface, not a sibling of the contributor profile.
_Avoid_: focused key state, client-only drill-down, profile-vs-gallery split

**Unattributed**:
The single bucket for replications whose creator is not known. There is exactly one such bucket; "Anonymous" is retired because it implies the creator chose to hide, when in fact nobody knows who they are.
_Avoid_: Anonymous, Unknown artist, unknown-artist bucket

**Artist Page**:
The one public surface for a replication artist: their works browsable gallery-style, enriched by bio, avatar, and links when the artist has claimed a Contributor Profile. Every artist has one, auto-generated from their credited works; a Contributor Profile decorates it rather than competing with it, and logged-in contributors keep editing their profile as today.
_Avoid_: gallery artist view vs. profile split, artist focus page

**Replication Showcase**:
The shared full-frame preview pattern inside substance and effect articles: one prominent work, a compact work strip or count, and an explicit entry into the Replication Viewer. Substance showcases use per-substance Convex-backed curation; effect showcases use the owning effect's collection.
_Avoid_: substance gallery tab, article replication gallery, competing inline player

**Replication Viewer**:
The canonical expanded overlay for replication playback and exploration. It preserves the source collection, active work, and gallery grouping in a shareable URL; Close returns to that collection. Single-collection viewers move horizontally through works. Multi-group Gallery views additionally move vertically between the gallery's active artist or effect groups.
_Avoid_: separate mobile player, unscoped lightbox, fullscreen gallery

**Balanced Quick-Link Rows**:
The homepage quick-link wrapping rule: row sizes differ by at most one, wider rows come first, and every row is centered (five icons wrap 3+2; four wrap 2+2).
_Avoid_: left-aligned wrap, orphan icon row

## Public Host Language

**Construction Hosts**:
`dose.wiki` and `www.dose.wiki`, the two public domains held behind the launch gate. They are attached to the same Vercel project as `dosewiki-admin.vercel.app` and serve the same build; only `middleware.ts` tells them apart.
_Avoid_: production domain vs. admin deployment, the gated project

**Editor Hosts**:
`dev.dose.wiki` and `dosewiki-admin.vercel.app`, which serve the whole app ungated — the finished site plus `/dev`, `/review` and sign-in. `dev.dose.wiki` is the canonical one; a Construction Host redirects editor links there rather than to the holding page. Both are closed to crawlers until launch.
_Avoid_: admin deployment vs. dev subdomain, the staging site

**Holding Page**:
What the Construction Hosts answer at the bare `/`: the real homepage with every destination blocked, the Theme Lab withheld, and a pill counting down to the launch floor. It is the `/under-construction` route, reached by rewrite, so the address bar still reads the bare origin.
_Avoid_: splash page, landing card, coming-soon page

**Preview Address Space**:
The `/preview` prefix under which the Construction Hosts serve the finished site before launch — `/preview/home` is the homepage, `/preview/substances` the Substance Index. It is an address, not a route tree: the middleware rewrites it onto the ordinary page it mirrors, and a bare path on those hosts redirects into it, so no `href` is ever written with the prefix.
_Avoid_: preview routes, preview mode, staging path, mirror site

**App Path**:
A pathname as the route tree models it, with any Preview Address Space prefix stripped — what `toAppPath()` returns and what every client route comparison must use.
_Avoid_: raw pathname, request path
