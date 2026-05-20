# Prompts Registry Key Contract

## Files

- `src/data/config/sectionPrompts/index.ts`
- `src/data/config/sectionPrompts/*.md`
- `src/hooks/usePrompts.ts`
- `convex/prompts.ts`
- `scripts/migrate/migrate-prompts-to-convex.mjs`
- `scripts/migrate/compare-prompts.mjs`
- `scripts/batch/*/loader.mjs`
- `scripts/batch/summary/source-material.mjs`

## Problem

Prompt identity is currently spread across several Modules. `sectionPrompts/index.ts` defines `SectionKey` and UI metadata, migration scripts derive Convex keys from markdown filenames, batch loaders hard-code keys such as `section_harm_potential`, and Convex accepts any string key. The Interface for "which prompts exist" is therefore shallow: each caller must know naming rules, filename conversion, Convex key prefixes, and which prompt kinds are valid.

This weakens Locality. Adding or renaming a prompt section requires auditing UI metadata, local markdown filenames, migration scripts, section-generation hooks, batch loaders, and Convex documents. The `summary` section is in `SectionKey` but missing from `sectionMetadata`, which is a small example of the registry split already leaking into behavior.

## Proposed deepening opportunity

Introduce a prompt registry Module that owns prompt identity. Its Interface should expose typed prompt descriptors: key, kind, section key when applicable, label, markdown seed path, Convex key, source-material expectations, and editor visibility. The Implementation can still read local markdown seed files and Convex documents, but callers should ask the registry for descriptors instead of recomputing keys or hard-coding strings.

Use this registry as the seam for:

- converting section keys to Convex prompt keys;
- enumerating prompts for migration and compare scripts;
- validating keys in `convex/prompts.ts` and `src/app/api/save-prompt/route.ts`;
- selecting prompt metadata in dev UI and batch loaders.

## Benefits

- **Module**: prompt identity becomes a named Module instead of repeated string conventions.
- **Interface**: callers use prompt descriptors rather than knowing filename, prefix, and section-key rules.
- **Implementation**: key conversion, seed-file lookup, and metadata completeness live in one Implementation.
- **Depth**: a small registry Interface hides the cross-runtime prompt inventory.
- **Seam**: the registry is the seam where local seed files, Convex documents, dev UI, and batch generators meet.
- **Adapter**: markdown seed readers, Convex prompt records, and batch loaders become Adapters over the same descriptor.
- **Leverage**: adding a new prompt requires one descriptor and can be picked up by scripts, validation, and UI.
- **Locality**: prompt key bugs concentrate in the registry and its tests instead of appearing as missing Convex prompts at runtime.

## Test plan

- Add registry tests proving every descriptor has a unique Convex key and, when seeded locally, an existing markdown file.
- Add tests for section-key to Convex-key conversion and markdown filename mapping.
- Add a validation test that `sectionMetadata`, `SectionKey`, and seeded prompt descriptors are consistent.
- Update migration and compare tests to use fake descriptors instead of filesystem naming assumptions.
- Add route or Convex mutation tests that unknown prompt keys are rejected once validation moves behind the registry seam.

## Risk/rollout notes

Start by adding the registry as a read-only source of descriptors while preserving existing keys. Migrate scripts and hooks first because they can be checked locally, then batch loaders, then write validation. Do not rename existing Convex keys during the first rollout; treat any key rename as a separate data migration.
