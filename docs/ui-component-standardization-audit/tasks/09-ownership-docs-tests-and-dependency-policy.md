# Ownership Docs, Tests, And Dependency Policy

## Objective

Document shared UI ownership and enforce promotion boundaries after public/common and dev/editor extraction patterns stabilize.

## Scope

- `docs/architecture/project-layout.md`
- Optional new `docs/ui-system.md`
- `src/components/ui/ownership.test.ts`
- Shared/public component barrels
- `package.json` UI dependencies

## Source findings

- `shared-ui-and-tokens.md`
- `dev-editor-ui.md`
- `public-pages-and-chrome.md`
- `effects-and-reports-ui.md`

## Affected files/modules

UI/common ownership docs, component promotion criteria, ownership tests, icon library policy, motion dependency policy, route-specific UI dependency boundaries.

## Proposed component/API shape

- Shared UI inventory table with:
  - component
  - owner
  - intended consumers
  - reusable patterns
  - components/tokens/variants exposed
  - naming conventions
  - promotion criteria
  - migration path notes
- Ownership tests:
  - `src/components/common` must not import from `src/features`, `src/app`, or domain data modules.
  - `Button` variants must not use feature names or composed-recipe names after migration.
  - dev-owned components remain under `src/features/dev/components`.
- Dependency policy:
  - canonical shared icon abstraction
  - motion ownership
  - lightbox/gallery ownership
  - editor-only code/diff dependency ownership

## Migration steps

1. Add a concise shared UI inventory to architecture docs or a dedicated UI system doc.
2. Record public/common promotion criteria: second runtime consumer, stable prop API, no feature-domain dependency, and tokenized styling.
3. Record protected dev/editor promotion criteria separately.
4. Add ownership tests after migrations make them actionable.
5. Document canonical icon path and where `lucide-react`, Iconify, lightbox, `framer-motion`, and editor code dependencies are allowed.
6. Update docs as each task promotes or retires a primitive.

## Tests/verification

- Ownership tests fail on boundary regressions and pass with documented allowlists.
- Dependency policy matches actual imports.
- Docs link to current anchors: `Surface`, `Button`, `Badge`, `ArticleSection`, `SectionCard`, `StateCard`, and dev editor primitives.

## Dependencies

- Task 01.
- Task 02.
- Task 03.
- Task 08.

## Non-goals

- Do not block current migration with strict tests before baseline work is complete.
- Do not create heavyweight design-system process docs.
- Do not require every feature component to become shared.
