# Tolerance Extraction

Extract every tolerance passage from the supplied collected-source file for one substance article. Use only the supplied source documents. Extraction preserves source text verbatim; it is not summarisation, synthesis, rewriting or explanation.

## 1. Identify sources

The staged file begins with the substance title and a Collected Sources suffix; each document begins with `## Source: <Source Name>` and is separated from the next by `---`. There may be one to a dozen sources, ranging from a few lines to many pages. Source names may be slugs; retain them exactly as written.

Account for every source in input order, including empty documents. Keep each passage attached to its originating source.


## 2. Decide which passages qualify

Include any passage about the body's response changing with repeated exposure to this substance, or about how far apart doses should be spaced.

| Include | Boundary or context to retain |
| --- | --- |
| Tolerance building | How fast, how far, to which effects and after how many doses |
| Tolerance fading | Half-tolerance and baseline reset times; advice to wait between uses, even without the word tolerance |
| Reduced tolerance after abstinence | Associated overdose risk on relapse, with the whole surrounding paragraph |
| Cross-tolerance | Substances or classes involved, direction and completeness |
| Reverse tolerance, sensitisation, tachyphylaxis and kindling | The source's account of changing response |
| Receptor downregulation or upregulation, enzyme induction and neuroadaptation | Include when offered as an explanation for tolerance |
| Dosing that depends on tolerance | Statements about naive or non-tolerant users, higher dose requirements in regular users, and ceiling effects |
| Dependence, withdrawal and abuse-potential prose | Include when the same passage also addresses tolerance; take a paragraph headed Tolerance and addiction potential whole |

Exclude other meanings of tolerance: social or political attitudes, crop or herbicide tolerance, tolerance of heat, cold, stress or exercise described as a drug effect, and food intolerance or allergy. These meanings alone do not describe repeated-exposure tolerance or dose spacing.

Include a passage when its relevance remains uncertain. A tolerance fact embedded in an otherwise unrelated paragraph qualifies the entire paragraph.

Read every source end to end. Before concluding that it is silent, inspect:

- Tolerance and addiction potential, and Dependence and abuse potential sections.
- Pharmacology, pharmacokinetics and mechanism-of-action sections.
- Dosage sections and warnings, including advice for non-tolerant users and starting doses.
- Harm-reduction, safety, health and responsible-use notes.
- Interaction lists, including one drug lowering tolerance to another.
- Summary and overview paragraphs.

Continue when every source has been reviewed and every qualifying or uncertain passage identified. A no-content result is justified only when no passage in that source qualifies; an all-empty extraction is valid.

## 3. Preserve the selected material

- Copy the whole paragraph, whole list item or whole table row. Every sentence remains complete, including when the tolerance fact occupies only part of the unit.
- Copy text directly from its source, character for character: spelling, punctuation, markdown, links, typos, numbers and units. Keep all qualifications as written, without conversion, rounding or reformatting.
- Keep source boundaries intact. Never invent a tolerance timeline or supplement the source from memory or another source.
- Author only the metadata, source headings, separators and markers in step 4. Separate multiple passages from the same source with a single blank line; `---` marks only the end of a source block.

Continue when all selected units retain their complete wording and provenance. Each passage must match its source character for character; the downstream substring check rejects any drift.

## 4. Emit the excerpt document

Output this excerpt document body, without surrounding code fences, preamble or closing commentary:

```
# <Substance Title> - Tolerance Quotes

> Verbatim extractions from source articles. Generated <YYYY-MM-DD>.

## Source: <first source name>

<verbatim passage>

<verbatim passage>

---

## Source: <second source name>

*No tolerance content found.*

---
```

Take the substance title from the staged file's first line, removing the Collected Sources suffix and its separator. Use today's date as `YYYY-MM-DD`.

Emit exactly one `## Source:` heading for every input source, with its exact name and original order. End every source block with `---`. A nonempty document with no qualifying passage gets exactly `*No tolerance content found.*` alone under its heading. An empty document gets exactly `*No content available for this source.*`.

## 5. Check completion

Before responding, confirm:

- Every source has been read end to end, including the likely locations in step 2, and is represented once in input order.
- Every qualifying or uncertain passage is included as a complete unit; unrelated meanings of tolerance alone are excluded.
- All copied claims, timings, numbers and qualifications retain their original wording and source.
- Empty results reflect missing source evidence rather than an incomplete search.
- The response follows the excerpt-document format exactly.
- The four downstream fields below have been checked for available evidence. They identify high-value passages, not a narrower selection rule: other passages still qualify under step 2.

| Field | What it needs from the source |
| --- | --- |
| `full_tolerance` | How long continuous use takes to build full tolerance, and to which effects |
| `half_tolerance` | How long abstinence takes to halve tolerance |
| `baseline_tolerance` | How long abstinence takes to reset tolerance to baseline |
| `cross_tolerance` | Which substances or drug classes share tolerance with this one |
