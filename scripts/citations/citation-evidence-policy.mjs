// Generic evidence policy for the marker-only workbench workflow, not citation-pi.
// Producers render these rules into task packets for workers without inherited skills.
// Artifact fields and acceptance gates remain owned by the executable workbench contract.
export const WIKIPEDIA_DISCOVERY_INSTRUCTION = "Wikipedia excerpts and reference caches are discovery-only. Inspect the actual cited source before using it as public support; supportingQuote must be a contiguous verbatim quote from that inspected source, and referenceId must identify that same source, never a Wikipedia quote attributed to the underlying work. If the source cannot be inspected or does not support the exact claim, preserve the unmarked claim and record a gap.";

export const CITATION_EVIDENCE_RULES = Object.freeze([
  "Only insert [cite:reference-id] markers. Stripping markers must restore the original nested section value exactly, including shape, text, punctuation, capitalization, whitespace, and paragraph breaks.",
  WIKIPEDIA_DISCOVERY_INSTRUCTION,
  "PsychonautWiki, TripSit, other wiki/community pages, and their local caches are also discovery-only. Public support must come from eligible inspected non-wiki sources.",
  "Use live web research only when the task's allowLiveWebResearch permission is true. Otherwise stay within approved task material.",
  "Every public marker needs supported evidence at its exact field path, a stable unique claimKey, a canonical reference ID bound to an included inspected source body, a contiguous verbatim quote from that body, and a rationale satisfying the executable checker and scanner.",
  "Do not force weak or ambiguous support. Preserve unsupported claims without markers and record needs_source or needs_review as internal gaps, not public support.",
  "An accessible abstract may support a claim even when full text is paywalled, but only if the abstract directly supports that exact claim; quote the abstract and record access as abstract_only.",
]);

export const SECOND_PASS_RESEARCH_INSTRUCTION = "For researchPass: second, follow the immutable researchBrief in citation-task.json: its candidate researchLanes, completionCriteria, and hardRules own the extra pass. Preserve lane-by-lane researchLog evidence; do not replace the brief with an ad-hoc coordinator plan.";

export const SECOND_PASS_RESEARCH_RULES = Object.freeze([
  "Inspect the existing article reference pool first, then execute the candidate's researchLanes in order, expanding canonical names with synonyms and only explicitly named metabolites or plant constituents.",
  "Analogues, parent compounds, metabolites, or plant constituents may support only claims that explicitly concern them; never transfer compound-specific evidence by analogy.",
  "A second pass may end in confirmed_needs_source; coverage is not a success metric.",
]);

export const SECOND_PASS_COMPLETION_CRITERIA = Object.freeze([
  "Inspect every research lane and record the exact queries, inspected sources, and outcomes in researchLog.",
  "Add a marker only when an eligible inspected source directly supports the exact public claim and quote fidelity passes.",
  "If no source closes the claim after every prescribed lane has an auditable negative outcome, preserve the prose and record confirmed_needs_source with a concise negative research log. Incomplete research remains needs_source or needs_review, not confirmed_needs_source.",
]);
