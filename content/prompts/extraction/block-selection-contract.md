# Block-selection output contract

This contract replaces the extraction prompt's output format. Select block IDs;
the host program copies their original text verbatim.

## Select

1. Read every source using the extraction prompt's {{TOPIC}} criteria.
2. Select the IDs covering every unit that qualifies under the extraction prompt,
   including its required companion context. Apply that prompt's relevance and
   uncertainty criteria.
3. Retain every source heading in source order. List its selected IDs once each
   in ascending order, or `NONE` when no block is relevant.

Complete when every source and potentially relevant block is accounted for.

## Return

Return only source headings and IDs in this format, without code fences,
source text, or explanations. Copy each source name exactly:

## Source: <source name>
B0007
B0008
B0022

## Source: <next source name>
NONE
