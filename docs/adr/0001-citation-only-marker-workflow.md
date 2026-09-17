# Citation-Only Marker Workflow

**Status:** Accepted; partially implemented.
**Current implementation:** `scripts/citations/citation-marker-workflow.mjs`, `citation-only-validator.mjs`, and `workbench-draft-adapter.mjs` implement the marker-only workbench and apply path. `formal-citations-core.mjs` still retains the legacy claim-key synchronization path, so the citation workflow has not fully cut over.

We will move the dose.wiki citation workflow away from hard-coded claim-key placement mappings and toward direct citation-marker edits on real article fields. Citation workers may insert `[cite:reference-id]` markers into the citable article surface using Wikipedia-style citation judgment, while validation rejects any output where stripping citation markers does not restore the original article text exactly. This keeps citation placement flexible and article-safe without forcing every claim through brittle adapter rules.

**Consequences**

- Section workers own full top-level citable sections, and a final article-wide pass reviews the already-cited citable article surface.
- Public markers require Wikipedia-grade references plus an evidence trail with inspected-source support quotes and rationale.
- Unsupported or weakly supported claims stay unchanged; failed section outputs are archived for later repair instead of being applied.
