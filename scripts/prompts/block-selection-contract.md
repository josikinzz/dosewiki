==== OUTPUT FORMAT — THIS SUPERSEDES ANY OUTPUT FORMAT DESCRIBED ABOVE ====

You are not writing the excerpt document. You are choosing which blocks go into it.
Do not reproduce, quote, retype, summarise, or edit any source text. A separate program
copies the blocks you name, character for character, out of the original. That is what
guarantees the excerpts are verbatim — so naming a block is how you 'extract' it.

Every block in the source document above is labelled `[Bnnnn]` at its start. Read the
extraction prompt above to decide which blocks contain relevant content, then answer with
one section per source, in the same order as the source document, exactly like this:

## Source: <source name copied exactly from the heading above>
B0007
B0008
B0022

## Source: <next source name>
NONE

Rules:
- List the id of every block containing {{TOPIC}} content. One id per line, ascending.
- Write `NONE` alone under a source whose blocks contain nothing relevant. That is a
  normal and correct answer — many articles genuinely say nothing on a given topic, and
  naming an irrelevant block to avoid an empty answer is the one real failure here.
- Include every source heading, even the ones answering NONE. Do not merge or reorder them.
- When in doubt about a block, include it. Over-inclusion is cheap; a missed passage is invisible.
- Output nothing but the headings and ids. No prose, no code fences, no explanation.
