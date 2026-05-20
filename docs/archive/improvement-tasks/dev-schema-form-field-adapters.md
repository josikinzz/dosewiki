# Dev Schema Form Field Adapters

## Title

Deepen schema-driven form rendering with explicit field Adapters.

## Files

- `src/features/dev/forms/schema/SchemaForm.tsx`
- `src/features/dev/forms/schema/SchemaSection.tsx`
- `src/features/dev/forms/schema/SchemaField.tsx`
- `src/features/dev/forms/schema/fields/index.ts`
- `src/features/dev/forms/schema/fields/TextField.tsx`
- `src/features/dev/forms/schema/fields/TextareaField.tsx`
- `src/features/dev/forms/schema/fields/TagArrayField.tsx`
- `src/features/dev/forms/schema/fields/DoseField.tsx`
- `src/features/dev/forms/schema/fields/DurationField.tsx`
- `src/features/dev/forms/schema/fields/CitationField.tsx`
- `src/data/schema/`

## Problem

The schema-driven form promises that sections and fields render automatically from metadata, but `SchemaField` still hard-codes field dispatch, value transformation, array handling, citation handling, and object JSON parsing in one switch. The shallow seam is visible in `src/features/dev/forms/schema/SchemaField.tsx:19`, where every field type must know the same display-value and change-value conventions.

This makes `FieldMeta` less powerful as an Interface than it could be. Adding a new field type or changing parsing behavior requires editing the central switch and remembering hidden rules such as "object without transformer means textarea JSON that silently ignores invalid JSON." The current Module gives limited Leverage from the generated schema metadata because rendering and parse policies are not first-class Adapters.

## Proposed deepening opportunity

Introduce a field Adapter registry:

- Each Adapter declares `type`, `toDisplayValue`, `toSchemaValue`, `render`, and optional `validateDraft` behavior.
- `SchemaField` looks up the Adapter by metadata and delegates conversion/rendering.
- Object JSON fields get an explicit draft/error Interface rather than silently dropping invalid JSON.
- `SchemaForm` keeps section ordering and route-field placement, but field behavior lives behind Adapter Modules.

The generated schema metadata can stay as the source of truth. The improvement is to make the rendering seam deeper so new metadata field types are added by registering Adapters rather than expanding one switch.

## Benefits

- **Module**: Makes each schema field type a Module with its own Interface and Implementation.
- **Interface**: Clarifies the field Interface: display conversion, schema conversion, validation, and rendering are explicit.
- **Implementation**: Removes central switch growth and moves type-specific behavior into local Adapter Implementations.
- **Depth**: Increases Depth because `SchemaField` becomes a small dispatcher while each Adapter hides its details.
- **Seam**: The Adapter registry is the seam where generated schema metadata meets form rendering.
- **Adapter**: Text, textarea, number, tag array, dose, duration, citation, and object JSON fields become concrete Adapters.
- **Leverage**: New field types and validation behaviors can be added without touching unrelated fields.
- **Locality**: Bugs in citation editing, object JSON parsing, or dose conversion stay local to one Adapter and its tests.

## Test plan

- Add Adapter tests for each field type covering display conversion, schema conversion, disabled state propagation, and invalid draft handling.
- Add a `SchemaField` registry test that verifies unknown field types use the fallback Adapter.
- Add object JSON tests that preserve invalid draft text and expose validation errors without corrupting the article.
- Keep `SchemaForm` tests focused on section ordering, excluded sections, and route-field insertion.

## Risk/rollout notes

Generated schema behavior is broad, so roll this out by wrapping the existing switch behavior behind Adapters first. Once parity tests pass, make object JSON validation explicit in a second step so behavior changes are isolated and reviewable.
