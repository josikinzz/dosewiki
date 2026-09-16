# Canonical Legal Status Vocabulary

**Status:** Accepted; widen phase implemented.
**Current implementation:** `src/schema/substance/shared.ts` still requires the free-string `status`; `canonicalStatus` and `instrument` remain optional. `src/features/article/components/sections/LegalitySection.tsx` prefers the canonical status and falls back to legacy status coloring. Narrowing is not complete.

We will replace free-string country legality statuses with a small canonical legal status vocabulary (roughly eight to ten values such as prohibited/scheduled, prescription-only, analog/blanket-ban coverage, unscheduled, decriminalized, legal-regulated). Every country entry carries one canonical legal status plus a separate legal instrument field naming the jurisdiction-specific law, with free-text prose remaining in notes. The legality research workflow enforces the vocabulary at research time, and existing free-string entries are mapped during each substance's cite pass rather than in a standalone migration.

We chose this over keeping free strings (zero migration work, but 277 articles times 40+ countries of inconsistent phrasing forecloses cross-substance comparison and reliable badge styling) and over researching first and canonicalizing later (which re-touches every entry twice).

**Consequences**

- `countryLegalitySchema` widens to carry the canonical status and legal instrument fields; stored article data migrates widen-then-narrow as runs roll out, so mixed old/new entries coexist during the rollout.
- Badge colors and any future per-country comparison or filtering UI key off the canonical status instead of `STATUS_COLOR_MAP` string patterns.
- The vocabulary itself becomes a maintained contract: adding a value is a deliberate schema-and-prompt change, not an ad hoc string.
