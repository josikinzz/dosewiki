# Dev tools redesign log

A running record of the one-tab-at-a-time redesign of every `/dev` tool on the
`dev-tools-redesign` branch. Each pass ran `/impeccable critique` against one
tab at desktop and phone widths and implemented every finding without removing
a feature.

Read this whole file before starting a pass, and follow the conventions below
so the tools keep reading as one product. When a pass sets a new convention or
builds a new shared primitive, add it to **Conventions** and log it under
**Passes**.

## References

- Replication Studio was redesigned before this log started. Its screenshots
  are in `tmp/critique-a/` and its source is in
  `src/features/dev/tools/replication-studio/`. Use it as the reference for the
  quality bar.
- `/dev/kit` catalogs the shared editor kit. Reach for it before building
  anything new.
- `docs/design/ui-kit.md` and `docs/design/visual-style-guide.md` define the
  visual language. This is a refinement within that language, not a new look.

## Conventions

- Below `sm`, tab strips and segmented controls stay on one row and scroll
  sideways with an edge fade (`EditorNavTabs` and `EditorSegmentedControl` in
  `src/features/dev/components/EditorNavigation.tsx`). They never wrap.
- Grid children in the dev shell can shrink, and long words break
  (`.theme-dev-shell` in `src/features/dev/dev-tools.css`), so nothing runs off
  a phone screen.
- Touch targets are 44px, using the halo from `@/components/ui/touchTargets`
  when the visible control is smaller.

## Passes

Each entry lists the tab, the commit, the main changes, any new shared
primitives or conventions, and anything deferred.
