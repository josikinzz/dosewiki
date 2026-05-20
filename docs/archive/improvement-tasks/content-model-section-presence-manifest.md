# Content Model Section Presence Manifest

## Files

- `src/schema/substance/article.ts`
- `src/schema/substance/{dosage,duration,harm-potential,legality,pharmacology,interactions,classification,editorial}.ts`
- `src/features/article/components/ArticleLayout.tsx`
- `src/features/article/components/sections/TableOfContentsSection.tsx`
- `src/features/article/components/sections/{DosageDuration,HarmPotential,Legality,Pharmacology,Interactions,Tolerance}Section.tsx`
- `src/features/dev/forms/ArticleDraftFormFieldsRHF.tsx`
- `src/features/dev/forms/{DosageDuration,HarmPotential,Legality,Chemistry,Interactions,Tolerance,Classification,EditorialReview}FieldsRHF.tsx`
- `scripts/batch/{dosage-duration,harm-potential,legality,pharmacology}/`
- `scripts/prepopulate/`

## Problem

The content model sections exist end-to-end, but the section inventory is not a deep Module. Schema files define storage shape, the dev form manually orders editable fields, `ArticleLayout` manually renders public sections, `TableOfContentsSection` separately decides which public sections are present, and batch/prepopulate workflows know their own section keys and update targets.

That makes the section Interface shallow. Adding or changing a substance section requires callers to remember several facts at once: schema key, editor field Module, public section id, table-of-contents label and icon, generated prompt key, quote section, batch generator support, prepopulate behavior, and whether the section is public or editor-only. The deletion test suggests the hidden policy would reappear across route rendering, dev forms, prompt loaders, and batch scripts because no single manifest owns the section contract.

The mismatch is visible in presence checks. `TableOfContentsSection` has local `isPresent` rules, each public section has its own null-render condition, and generator/prepopulate scripts use separate "has content" checks to decide whether to skip or overwrite dosage, duration, harm potential, legality, tolerance, interactions, pharmacology, and classification-related fields. `editorial_review` is part of the article shape and editor UI but must not participate in the public article manifest.

## Proposed deepening opportunity

Introduce a content-model section manifest Module. Its Interface should describe each substance section in domain terms:

- article field keys and schema ownership
- editor visibility and editor form Adapter
- public visibility, section id, label, icon, and public renderer Adapter
- table-of-contents presence policy
- generator prompt key and quote section, when supported
- batch/prepopulate update capability, when supported
- editor-only policy for `editorial_review`

The Implementation can keep actual React rendering, Zod schema definitions, and generator logic in their current files. The manifest should be the seam where cross-cutting section metadata is declared once and consumed by public article layout, table of contents, dev form ordering, section-generation controls, and batch/prepopulate discovery.

This is distinct from the broader article projection builder work: the projection Module would normalize article data, while this manifest Module would own the section inventory and section-level behavior contract.

## Benefits

- **Module**: substance content sections become a named Module instead of parallel lists in schema, editor, public display, and generators.
- **Interface**: callers ask the manifest which sections exist and how they behave, rather than knowing per-section keys, ids, icons, visibility, and generation support.
- **Implementation**: section metadata, presence policy, and editor/public/generator capability flags stay concentrated while renderers and schemas remain local.
- **Depth**: a compact manifest Interface hides many cross-runtime section rules.
- **Seam**: section behavior changes at the manifest seam before reaching App Router pages, dev forms, or batch scripts.
- **Adapter**: public renderers, editor field Modules, batch generators, and prepopulate transforms become Adapters attached to manifest entries.
- **Leverage**: new or changed sections get consistent table-of-contents, editor ordering, prompt discovery, and public visibility behavior from one declaration.
- **Locality**: bugs from missing TOC entries, stale prompt keys, or accidental public exposure of editor-only fields concentrate in the manifest tests.

## Test plan

- Add manifest tests proving every public manifest entry has a unique section id, label, icon, presence policy, and renderer Adapter.
- Add tests proving every editor-visible entry has a dev form Adapter and every generator-enabled entry has a prompt key and quote-section policy.
- Add parity tests comparing manifest-driven table-of-contents output with current examples for articles containing dosage/duration, harm potential, legality, tolerance, interactions, pharmacology, and sparse classification data.
- Add an explicit test that `editorial_review` is editor-visible and public-hidden.
- Run focused article section tests, dev form tests, batch generator tests for section discovery, and `npm run typecheck`.

## Risk/rollout notes

Start by adding the manifest as read-only metadata and testing it against current hard-coded behavior. Migrate `TableOfContentsSection` first because it is mostly metadata and presence policy. Then migrate dev form ordering and public layout after parity tests exist. Keep generator and prepopulate scripts as explicit Adapters until batch persistence and migration workspace work has deeper coverage.
