# Dev Tools: New Drug Creator Tab Plan

## Goal
Create a lightweight second tab inside the Dev Tools page that helps contributors compose brand-new substance records aligned with `articles.json` without manually hand-writing JSON.

## Data Snapshot
The generator must surface all top-level fields used in the existing dataset:
- `id` (number)
- `title` (string)
- `content` (string, currently unused but should remain editable)
- `index-category` (string)
- `drug_info` (object) with:
  - `drug_name`, `chemical_name`, `alternative_name`, `search_url`
  - `chemical_class`, `psychoactive_class`, `mechanism_of_action`
  - `dosages.routes_of_administration[]` each containing `route`, `units`, and `dose_ranges` (`threshold`, `light`, `common`, `strong`, `heavy`)
  - `duration` (`total_duration`, `onset`, `peak`, `offset`, `after_effects`)
  - `addiction_potential`, `notes`, `half_life`
  - `interactions` buckets (`dangerous`, `unsafe`, `caution`)
  - `subjective_effects[]`, `categories[]`, `tolerance` (`full_tolerance`, `half_tolerance`, `zero_tolerance`, `cross_tolerances[]`)
  - `citations[]` with `name` + `reference`

## UX Outline
- **Tab toggle**: reuse the existing Draft Editor UI but add a top-level segmented control (e.g., `Edit existing` / `Create new`). Switching tabs swaps the body content without affecting the current draft state.
- **Scaffold layout**: single-column scroll area inside a `SectionCard`, divided into logical sections that mirror the substance article layout (Meta, Pharmacology, Dosage, Duration, Safety, Subjective Effects, References).
- **Field groups**:
  - Simple strings: render as standard text inputs or textareas (for longer copy like notes/addiction potential).
  - Arrays of strings: allow adding/removing chips with minimal controls ("Add effect", "Add category").
  - Structured arrays (ROA list, citations): provide inline cards with inputs and "Add route" / "Add citation" buttons.
- **Live JSON preview**: sticky panel on desktop (full-width stack on mobile) showing the generated payload, powered by the same `JsonEditor` component in read-only mode for consistent styling.
- **Actions**: buttons beneath the preview for `Copy JSON` and `Download JSON`, mirroring the existing instrumentation. Include a `Reset form` to clear all inputs.

## Functionality & State
- Maintain a single `newArticle` state shaped exactly like the dataset schema (with reasonable defaults such as empty strings/arrays and one blank ROA row).
- Derived `generatedJson` string via `JSON.stringify(newArticle, null, 2)` whenever state changes.
- Input handlers update nested paths; prefer small helpers (e.g., `updateRoute(index, patch)`) to keep components simple.
- Validation kept minimal: highlight required fields (title, drug_name, at least one ROA) and disable export actions until they are filled.
- Auto-sync `title` \<-> `drug_info.drug_name` when either edits an empty counterpart to reduce duplicate typing.

## Implementation Steps (Future Work)
1. Extract shared tab switcher + action button primitives so both the draft editor and creator tab stay consistent.
2. Build the new tab shell with initial state factory and live JSON preview.
3. Implement form sections incrementally (meta, pharmacology, dosage, duration, safety, effects, tolerance, citations).
4. Wire up copy/download/reset actions and lightweight required-field validation.
5. QA the generated JSON by importing it back into the existing draft editor to ensure shape parity.

## Outstanding Questions
- Should IDs be auto-generated (e.g., placeholder negative value) or manually entered? (Default to manual entry for now.)
- Do we need support for optional article-specific content beyond `drug_info` (e.g., `content` routes)? Currently out of scope unless editors request it.
