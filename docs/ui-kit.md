# UI Kit

The dose.wiki UI Kit is the single, standardized set of shared UI building blocks.
**Before building any UI, reuse the kit. Do not hand-roll a button, badge, card,
input, dialog, or surface that already exists.**

This is the front door. Two companion docs go deeper:

- [`docs/ui-system.md`](ui-system.md) — the ownership contract (who owns what, promotion criteria, Button variant policy).
- [`notes-and-plans/guides/dosewiki-visual-style-guide.md`](../notes-and-plans/guides/dosewiki-visual-style-guide.md) — the visual language (color, type, spacing, motion).

## Browse it live: `/dev/kit`

The catalog renders every shared primitive with its real variants, props, a
copy-paste import line, and when-to-use / when-not-to-use guidance — in the real
theme tokens, with a working light/dark toggle.

- Route: **`/dev/kit`** (auth-gated under `/dev`, like the rest of the editor surface).
- Run `npm run dev` and open `/dev/kit`. It is the rendered source of truth — when
  the docs and the rendered component disagree, the component wins.

## Where the kit lives

Three tiers, each with its own barrel and ownership boundary:

| Tier | Path | What lives here |
| --- | --- | --- |
| **Primitives** | `src/components/ui/` | Radix/shadcn building blocks: `Button`, `Badge`, `Surface` (+ `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, `DangerCallout`), `Dialog`, `Select`, `Tabs`, `Input`, `Popover`, etc. |
| **Common** | `src/components/common/` | Shared recipes on top of primitives: `Icon`, `IconBadge`, `SectionCard`, `StateCard`, `ExpandButton`, `DisclosureCard`, `ArticleSection`, public tokens. |
| **Layout** | `src/components/layout/` | Public page shells and chrome: `Header`, `Footer`, `PageHeader`, public content/feedback/page primitives, segmented tabs. |

`Surface` is the meta-primitive — most card/panel shells should compose a `Surface`
variant before reaching for a raw `<div>` with border + background classes.

Import from the barrels:

```ts
import { Button, Badge, Surface, ContentCard } from "@/components/ui";
```

## Rules

1. **Reuse first.** Check `/dev/kit` and `docs/ui-system.md` before writing new UI.
   If a primitive almost fits, extend it through props/variants — don't fork it.
2. **Keep variants primitive.** Button/Badge variant names describe visual behaviour
   (tone, emphasis, shape, icon affordance), never a feature or route. Feature-named
   variants are blocked by `src/components/ui/ownership.test.ts`.
3. **Promotion is intentional.** Feature-local components stay beside their feature
   until they have multiple real consumers and a stable, data-shaped API
   (see promotion criteria in `docs/ui-system.md`). Don't relocate article/effects/
   reports/editor components into the shared kit just to "standardize" them.

## Adding or changing a shared primitive (the drift gate)

The catalog cannot silently rot. `src/app/dev/kit/registry/completeness.test.ts`
fails the build if a runtime export of the `ui/`, `common/`, or `layout/` barrels
has no catalog story (type-only exports are naturally excluded). A second test,
`registry/render.test.tsx`, server-renders every example so a provider-bound
component cannot break the build's prerender of the route.

To add a primitive:

1. Add the component under `src/components/ui/` and export it from `src/components/ui/index.ts`.
2. Write a story at `src/app/dev/kit/stories/<name>.story.tsx` (copy an existing one;
   it's a `StoryDef` — see `src/app/dev/kit/registry/types.ts`). List every exported
   symbol in the story's `exports` array and show each in an example.
3. Register it in `src/app/dev/kit/registry/index.ts`.
4. Run `npx vitest run src/app/dev/kit/registry/completeness.test.ts`.

Catalog source layout:

```
src/app/dev/kit/
  page.tsx                      # gated route entry
  KitCatalog.tsx                # catalog shell + token showcase + theme toggle
  components/CatalogPrimitives.tsx  # StoryCard / PropsTable / copyable import
  registry/
    types.ts                    # StoryDef contract
    index.ts                    # the registered story list
    completeness.test.ts        # drift gate (ui/ barrel)
  stories/*.story.tsx           # one StoryDef per primitive
```

## Scope status

All three shared barrels are fully catalogued and gated by the completeness test:

- **Primitives (`ui/`)** — every primitive.
- **Common (`common/`)** — every recipe, including the article/citation primitives.
- **Layout (`layout/`)** — page shells and public content/feedback/page primitives.

Feature-local components (article/effects/reports/editor) are intentionally **not**
relocated into the shared kit — they stay beside their feature per the ownership
contract. Use `docs/ui-system.md` to decide where a component belongs.
