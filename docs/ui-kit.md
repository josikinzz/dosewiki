# UI Kit

The dose.wiki UI Kit is the catalog and how-to authority for shared UI building
blocks. **Before building UI, browse the kit and reuse an existing component.
Do not hand-roll a button, badge, card, input, dialog, or surface that already
exists.**

Use these companion references for decisions outside the catalog:

- [`docs/ui-system.md`](ui-system.md) — ownership boundaries, promotion criteria,
  and dependency policy.
- [`notes-and-plans/guides/dosewiki-visual-style-guide.md`](../notes-and-plans/guides/dosewiki-visual-style-guide.md) — brand and visual language.

## Browse it live: `/dev/kit`

The catalog renders every shared primitive with its real variants, props, a
copy-paste import line, and when-to-use / when-not-to-use guidance — in the real
theme tokens, with a working light/dark toggle.

- Route: **`/dev/kit`** (auth-gated under `/dev`, like the rest of the editor surface).
- Run `npm run dev` and open `/dev/kit`. The catalog demonstrates the current
  component behavior; when prose and a rendered component disagree, inspect the
  component source and correct the catalog or guide.

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

1. **Reuse first.** Check `/dev/kit` and this guide before writing new UI. If a
   primitive almost fits, extend it through props or variants rather than forking
   it. Consult `docs/ui-system.md` when deciding which layer owns the result.
2. **Keep variants primitive.** Button and Badge variant names describe visual
   behavior (tone, emphasis, shape, icon affordance), never a feature or route.
   Feature-named variants are blocked by `src/components/ui/ownership.test.ts`.
3. **Promote intentionally.** Keep feature-local components beside their feature
   until they have multiple real consumers and a stable, data-shaped API. The
   promotion criteria live in `docs/ui-system.md`.

## Adding or changing a shared component

Two Vitest checks keep the catalog aligned with the shared barrels:

- `src/app/dev/kit/registry/completeness.test.ts` checks that every runtime export
  from `ui/`, `common/`, and `layout/` has one catalog story.
- `src/app/dev/kit/registry/render.test.tsx` server-renders every example and
  catches missing providers or other render failures.

These are verification checks, not build-time checks. They run with the Vitest
suite, including the `npm run test` step inside `npm run verify:app`.

To add or change a shared component:

1. Place it in the tier selected by `docs/ui-system.md` and export it from that
   tier's barrel.
2. Add or update a story in `src/app/dev/kit/stories/`. Use the `StoryDef`
   contract in `src/app/dev/kit/registry/types.ts`, list every runtime symbol in
   `exports`, and show each one in an example.
3. Register the story in `src/app/dev/kit/registry/index.ts`.
4. Run `npm run test -- src/app/dev/kit/registry/completeness.test.ts src/app/dev/kit/registry/render.test.tsx`.

Catalog source layout:

```
src/app/dev/kit/
  page.tsx                      # gated route entry
  KitCatalog.tsx                # catalog shell + token showcase + theme toggle
  components/CatalogPrimitives.tsx  # StoryCard / PropsTable / copyable import
  registry/
    types.ts                    # StoryDef contract
    index.ts                    # the registered story list
    completeness.test.ts        # shared-barrel drift check
    render.test.tsx             # story render check
  stories/*.story.tsx           # catalog story modules
```

## Scope

The completeness test compares the registered stories with the runtime exports
of all three shared barrels: `ui/`, `common/`, and `layout/`. Read the barrels
and the registry for the current inventory rather than maintaining a second list
here.

Feature-local article, effects, reports, and editor components stay beside their
features unless they meet the promotion criteria in `docs/ui-system.md`.
