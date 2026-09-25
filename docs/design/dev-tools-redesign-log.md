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
- **The frame owns where a save lands.** `DevWriteStatus`
  (`src/features/dev/pages/DevToolSaveLine.tsx`) is a quiet one-sentence strip
  directly under the rail, read off the registry's `saveModel`,
  `withoutApproval` and `saveLine`. It renders only for a ready, unlocked
  tool. A tool that states its model beside its own primary action sets
  `saveLine: "in-tool"` and renders `SaveLine` there; a tool with no single
  save sets `saveLine: "none"`. Never draw a second save sentence in the tool
  body when the shell already draws one.
- **Write freeze.** The shell root mounts `useWriteFreezeObserver`
  (`src/features/dev/components/writeFreeze.ts`), which watches this tab's
  own `/api/` writes for the 503 `DATA_WRITES_FROZEN` refusal. `useWriteFreeze`
  then turns `DevWriteStatus` and every `SaveLine` into `WRITE_FREEZE_COPY`
  until a write lands. Tools need nothing extra; do not add per-tool freeze
  banners. A tool may read `useWriteFreeze().frozen` to disable its primary
  write button with that copy as the reason.
- **Status pills speak in sentence case.** `EditorStatusPill` (and so
  `SaveLine`, inline `Notice`, `EditorActionStatus`) sets `text-xs
  font-medium normal-case tracking-normal` with the important modifier,
  because the Badge recipe's `type-chip-label` wins the cascade otherwise.
  Never pass `uppercase` or a tracking value to a status pill. Uppercase is
  only `type-meta-label` (group headings, menu labels) and `type-chip-label`
  (one-word chips).
- **Tool glyphs.** Every registry descriptor carries `icon` (an Iconify
  name). Menus, the phone sheet and the palette draw it with `ToolGlyph`
  (`DevModeToolRail.tsx`, class `theme-dev-tool-glyph`, accent when current).
  Rail pills stay text-only. After adding an icon name anywhere, run
  `npm run generate:icon-data` so it ships in the offline bundle.
- **Counts and unsaved marks.** Use `ToolLabel` plus `ToolMarks`
  (`DevModeToolRail.tsx`) for any control that shows a count or an unsaved
  dot: the label and its spoken suffix (", 3 awaiting review", ", unsaved
  changes", ", may be out of date") are one text run, and the visual dot and
  `CountBadge` are silent. `CountBadge` takes `stale` for a count whose
  refresh failed (hollow, `theme-dev-count-badge[data-stale]`).
- **Leaving the shell goes through the registry.** A link to a route outside
  the shell (Review, the utilities, any saved view outside `/dev`) spreads
  `guardedLinkProps(href, onOpenHref)`, so a plain click asks the
  unsaved-work registry first and a modified click still opens a new tab.
- **Menus vs reveals.** Rail and account menus use `MenuChevron` (chevron
  only, allowed for menus by the kit's expand policy). Content reveals keep
  `ExpandIndicator` / `ExpandButton` with a non-deprecated variant
  (`inline`); do not use `variant="compact"`.
- **Locked means readable text.** Tools above the role are listed with
  `LockedToolList` (grouped by requirement, each a list item, not a disabled
  menu item), in the rail's Locked popover and folded at the end of the phone
  sheet. Keep locked tools out of prime positions.
- **Keycaps.** Draw keys with the `theme-dev-kbd` class. Show the palette key
  with `usePaletteKeyLabel()` (`⌘K` on Apple, `Ctrl K` elsewhere). The `?`
  sheet splits a registered key string on " or " and " / " into caps, so
  register keys as plain text ("j / k", "Cmd+Z").
- **Account and session things live in `DevAccountMenu`**: keyboard
  shortcuts, the utilities (UI kit, Theme lab) and Sign out. Sign out asks
  first (the registry's dialog when there is unsaved work, a short confirm
  otherwise). Do not add more icon-only buttons to the rail's trailing
  cluster; add an account menu item or a palette command.
- **Palette commands.** The Cmd+K palette lists Recent (this browser), Tools
  (with glyph, group, count, unsaved mark, "Current"), Saved views, Records
  and Commands (Keyboard shortcuts, utilities, Leave editor, Sign out). A tool
  that wants a palette entry adds records through `devRecordSources`, not a
  button in the chrome.
- **The phone thumb zone belongs to the tool.** The tool switcher stays at the
  top of the shell (bar plus bottom sheet); tools own the bottom of the screen
  for their sticky save bars (`PortalReportEditor`, `MyReportsTab`,
  `ContributorProfileEditor`, `MoleculeEditorWorkbench` already do). Do not
  add a fixed bottom navigation.
- **Load failures** use `LoadErrorState` with `what` ("Could not load pending
  invites"). A message that carries an `/api/` path is tucked under Details
  automatically. `ConfirmDialog` shows a rejected `onConfirm` inside the
  dialog and relabels the button "Try again"; let the error throw with a
  readable message instead of catching it in the handler.
- **Utilities** (`/dev/kit`, `/dev/themes`) lead with `EditorBackLink`.
- The user-facing name of the surface is "Editor" (sr-only h1, nav landmarks
  "Editor tools" / "Editor sections", "Leave editor").

## Passes

Each entry lists the tab, the commit, the main changes, any new shared
primitives or conventions, and anything deferred.

### Pass 1: shell chrome (frame, rail, sheet, palette, shared primitives)

Commit: see `git log --grep "Dev tools redesign: Shell chrome"`.
Screenshots: `tmp/redesign/chrome/before/` and `tmp/redesign/chrome/after/`;
critique in `tmp/redesign/chrome/critique.md`, inventory in
`tmp/redesign/chrome/inventory.md`.

Main changes:

- Desktop rail: dropped the decorative wrench and the always-reserved pager
  slots (pagers render only while the strip overflows); dropped the mono
  "Content" caption; tabs are 32px with `rounded-control` and `text-sm`. The
  trailing cluster is Change log, a field-like "Find ⌘K" button, the account
  menu (avatar, name at 2xl, role) and a door-glyph Leave button (label at
  2xl). The whole admin rail now fits at 1440.
- Group menus name the open tool on their trigger ("Site | Writing") and list
  tools with glyphs and counts. Locked is a popover of readable text grouped
  by requirement.
- New `DevAccountMenu` (`src/features/dev/pages/DevAccountMenu.tsx`) replaces
  the Utilities popover, the sign-out glyph and the uppercase name. Utilities
  data moved to `src/features/dev/pages/devUtilities.ts`.
- Phone bar: tool glyph, current tool, the one roll-up count and an unsaved
  dot on the trigger, then Find and Leave. The sheet has a real title, a
  search row that opens the palette, two-column tool tiles, More (Change log,
  utilities, Leave), locked tools folded at the end, and an account row
  footer with a labeled Sign out. The fake drag handle is gone.
- Palette: Recent, glyphs, groups, counts, "Current", Commands, Retry for
  failed record sources, key hints footer, records cached per role and grant.
- `?` sheet: keycaps, `type-meta-label` headings, Esc listed, reachable from
  the account menu and the palette.
- Save line became `DevWriteStatus` under the rail; it no longer shows over a
  locked tool or a loading panel. Freeze detection added (see Conventions).
  Glossary's descriptor now has `saveLine: "none"` because its two saves
  contradicted the shell's "instant" sentence.
- Shared primitives: `EditorStatusPill` sentence case fix (affects every save
  line and inline notice, including Replication Studio's); `Notice` loses the
  stray `pr-24` and gains touch halos on dismiss; `ConfirmDialog` shows
  failures; `LoadErrorState` gains `what` and Details; `EditorNavTabs` gets
  roving tabindex with Arrow/Home/End and corner roles;
  `EditorServerHealthIndicator` drops its tracked uppercase; staged-recovery
  discards ask first; the stalled-loading hint keeps its delay under reduced
  motion.
- New kit stories: `EditorBackLink`, "Write freeze signal", and
  `WRITE_FREEZE_COPY` on the SaveLine story.

Deferred, with reasons:

- Proactive freeze display before any write: needs the server to expose the
  flag (a page prop or an API field), outside this frontend-only pass. The
  shell learns it from the first refused write instead.
- Compacting the public site header inside `/dev`: the header is the public
  layout tier and hosts the appearance cog and site search editors use.
- Rendering the rail on `/dev/kit` and `/dev/themes`: those routes do not
  mount the shell's session controller or unsaved-work registry, so a rail
  there would skip the guards or duplicate the controller.
- Renaming "Change Review" to avoid the "Review" collision: it is established
  editor vocabulary across a dozen tools and guarded by
  `editorVocabulary.test.ts`; a vocabulary decision for the owner.
- Regrouping the Site group (Playlists, My reports, Glossary): needs product
  ownership of those tools.
- Declined: a 2px accent focus ring (ui-kit rule 9 keeps focus a quiet 1px
  neutral cue); aligning the rail to the 6xl content column (the frame keeps
  one width across shell and full-bleed tools); a bottom-docked phone nav
  (see the thumb-zone convention).

For later passes:

- Glossary: decide where its draft vs approve save sentence lives (in-tool
  `SaveLine` or keep `saveLine: "none"`).
- Replication Studio: fold its own "Keyboard shortcuts" disclosure into the
  shell `?` sheet through `useDevShortcuts`.
- Every tool: pass `what` to `LoadErrorState`, and consider disabling its
  primary write button while `useWriteFreeze().frozen`.
- `theme:tokens:check` was already failing at baseline (201 unreviewed
  findings); the new `var(--theme-*)` reads in `dev-tools.css` are CSS
  declarations in the feature sheet, the sanctioned place for them.

