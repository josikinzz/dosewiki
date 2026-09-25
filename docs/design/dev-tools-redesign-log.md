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
- **Link rows.** A list of places to go (queues, drafts, languages) is an
  open, separated list, not a card per row and not rail chrome: a `ul` with
  `theme-dev-link-list -mx-2.5` (hairlines stay on the text column, the hover
  fill bleeds so row text lines up with the section heading) and rows with
  `theme-dev-link-row` plus a trailing `theme-dev-link-row-chevron`. The row
  a section leads with adds `theme-dev-link-lead`. A count of zero steps back
  with `theme-dev-link-count[data-zero]`. Classes live in
  `src/features/dev/dev-tools.css`; Home's `LinkRow`, `CountValue`,
  `CappedList`, `RowSkeletons`, `CountFailureLine`, `OnwardLink` and
  `HeadingCount` (`src/features/dev/tools/home/homeParts.tsx`) are the
  reference use. Do not reuse `theme-dev-rail-tab` for content rows.
- **Spoken row names.** A link row's visible parts join without spaces in the
  accessible name, so `LinkRow` inserts sr-only ", " before its meta and
  trailing slots ("Trip reports, 3 waiting"). Pass `label` when the joined
  parts still read badly; it must start with the visible label.
- **Counts in words.** A count uses `tabular-nums` in the body face, never
  `font-mono`. Loading is a skeleton bar with sr-only "Loading"; a failed
  count is "Unknown" with a warning glyph, never zero; a stale count keeps
  its number with "last known". Failed counts get one inline line with
  "Retry counts" under the lead, not a button in the section header.
- **Long lists cap at five** (`HOME_LIST_CAP`) behind an `ExpandButton`
  `count` variant labelled "Show all" / "Show fewer".
- **Dates on rows** are relative words in a `<time>` with the full date as
  its title (`describeDay` in `homeModel.ts`); add a warning tone only when a
  deadline is close.
- **One read, one error.** When one request feeds several sections, a failure
  renders one `LoadErrorState` (with `what`) and one Try again, not one per
  section. `LoadErrorState` now drops a trailing "Try again." from the
  message because the card already says it.
- **Empty states point onward.** An empty list says why it is empty and
  offers an `OnwardLink` to the tool where the work starts, named with the
  registry's `labelFor(role)` label.
- **Accent links** use `text-dose-accent-strong theme-accent-underline
  underline-offset-4 hover:underline`; `theme-accent-link` is not defined in
  any sheet (it silently renders body text; `ContributorProfileEditor` still
  uses it).
- **Utilities** (`/dev/kit`, `/dev/themes`) lead with `EditorBackLink`.
- **Triage workspace (list plus review pane).** A queue tool puts its list
  and filters on the left (`lg:sticky lg:top-24`, list `maxHeight`
  `min(calc(100dvh - 13rem), 720px)` so it fits under the public header) and
  a review pane on the right as an `EditorPanel className="overflow-visible"`
  (overflow must stay visible or sticky children stop sticking). The pane
  header names the item once: title, then source glyph and label, "Waiting
  since" age, status and urgency pills, and the "Open in <Tool>" accent link,
  with a pager ("N of M" plus previous/next icon buttons carrying
  `aria-keyshortcuts` j/k). No section descriptions that repeat the title.
  The Inbox (`src/features/dev/tools/inbox/InboxTab.tsx`, `ReviewPane`) is
  the reference.
- **Decision dock.** Every action on the item under review lives in one
  `sticky bottom-0` footer inside the pane (`theme-portal-rule border-t
  bg-[var(--editor-panel-bg)]/95 backdrop-blur`): the result notice (with
  Undo), the claim or ownership line, then the decision buttons, primary
  first. It sticks to the bottom of the screen only while the pane is on
  it, which is the phone thumb zone. One accent per pane: the decision, or
  "Open in <Tool>" when the owning tool decides; claim-like controls are
  outline. Pending buttons name their state ("Claiming", "Resolving").
- **Master/detail on phones.** Below `lg`, picking a row calls
  `useScrollToDetail` on the pane (with `scroll-mt-24` so the public header
  does not cover it), and the pane carries "Back to list" (scrolls to the
  list and focuses the listbox) plus the pager, so triage never needs a
  scroll back up. An idle pane is hidden on phones.
- **Key caps on buttons.** A button bound to a single key shows the cap on
  fine pointers only: wrap `<kbd className="theme-dev-kbd">` in a span with
  `[@media(pointer:coarse)]:hidden` (the kbd class sets its own display, so
  the media class must sit on a wrapper) and put the key in
  `aria-keyshortcuts`. The cap is `aria-hidden`, so accessible names stay
  "Resolve", "Reject".
- **Unknown counts on filters.** A segmented option whose count is unknown
  (loading, or its queue failed) omits its `badge` rather than showing 0;
  totals omit theirs while any part is unknown.
- **Rail freshness in one line.** A tool that reads several rail badges shows
  one quiet line for every failed count (`useDevRailBadgeReadings`, last
  known value and time, one "Retry counts"), not one `DevRailBadgeFreshness`
  per badge. The Inbox's `RailCountFreshness` is the reference.
- **Filtered-empty says why and resets.** When filters hide every item, say
  how many wait outside the named filters and offer "Show everything" (a
  link button that resets them). A truly empty queue says "All clear".
- **Undo for the last triage decision.** Tools that make instant decisions
  bind `u` through `useTriageShortcuts({ onUndo })` and show Undo beside the
  success notice, reverting through the same status route and transition
  table the owning tool uses (back where it was when allowed, else
  Reviewing).
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

### Pass 2: Home (`/dev/home`)

Commit: see `git log --grep "Dev tools redesign: Home"`.
Screenshots: `tmp/redesign/home/before/` and `tmp/redesign/home/after/`
(every role; loaded, empty, failed, one count failed, loading, long lists,
many invites; dark and light), captured by `tmp/redesign/home/capture.mjs`.
Critique in `tmp/redesign/home/critique.md`, inventory in
`tmp/redesign/home/inventory.md`.

Main changes:

- A welcome line (`HomeIntro`): first name, role, and one sentence saying
  what this Home holds (`homeSummaryFor`).
- Layout by role instead of an auto two-column grid (`HomeRow`): admin gets a
  3:2 lead row (queues, invites), editor and contributor an even row, a lone
  section keeps `max-w-3xl`.
- Admin: the Inbox leads as a raised row with the total ("All clear" at a
  known zero), queues are link rows with demoted zeros, a "Counted at" line,
  and inline "Retry counts". Invites are link rows to People with the note on
  its own line and a relative close date that warns within two days.
- Admin now also sees their own drafts and proposals (`homeCardSetsFor`
  returns `["admin", "editor"]`); glossary languages stay covered by the
  Glossary feedback queue row.
- Editor: one error for the one `/api/dev/my-work` read; drafts and
  proposals capped at five; proposals put "Changes requested" first with
  updated date and comment count; empty states link onward.
- Translator: each language row is one link with native name (`lang`), count
  and Continue (Open when empty); total in the heading.
- Contributor: "N of 4 done", complete note, stronger To do; new "Your trip
  reports" section reading the existing My reports routes
  (`fetchMySubmissions`, `fetchOwnedReports`) with an onward link.
- Shared: `LoadErrorState` strips a trailing "Try again." (every tool);
  compact `StateCard` titles use the body face without tight tracking (the
  display face crowded at 16px); new link-row classes in `dev-tools.css`.
- Journeys fixtures now answer the Home reads (`/api/dev/my-work`,
  `/api/dev/invites`, `/api/dev/translation-inbox`,
  `/api/dev/contributor-profile`, `/api/dev/trip-reports/mine[/submissions]`)
  and give translating roles `glossaryLocales` (`FIXTURE_GLOSSARY_LOCALES`).

Deferred, with reasons:

- Age of the oldest item per queue and "claimed by you": the count routes
  return counts only; needs server fields.
- A summed translation inbox endpoint (one request instead of one per
  language): backend.
- Deep links to one invite in People or one field in the profile editor:
  those tools have no such routes yet; revisit in their passes.
- Keyboard shortcuts on Home: every row is a link in tab order and Cmd+K
  reaches any tool; no single primary action warrants a key.
- Rail badge "13" (stale) vs Home "At least 13": the rail is shell chrome.
- The `theme:tokens:check` count rises by the twelve `var(--theme-*)` reads
  in the new `dev-tools.css` rules, the sanctioned place for them.

### Pass 3: Inbox (`/dev/inbox`)

Commit: see `git log --grep "Dev tools redesign: Inbox"`.
Screenshots: `tmp/redesign/inbox/before/` and `tmp/redesign/inbox/after/`
(loaded dark and light; every source kind selected; reject and take over
dialogs; claimed; key info notice; unsent note; Mine; filtered-empty; frozen
claim; empty; failed; one queue failed; loading; stale rail counts; editor
locked; desktop and phone), captured by `tmp/redesign/inbox/capture.mjs`.
Critique in `tmp/redesign/inbox/critique.md` (21/40 before), inventory with
the item-by-item preservation check in `tmp/redesign/inbox/inventory.md`,
detector evidence in `tmp/redesign/inbox/detector/`.

Main changes:

- Layout: filters on top (assignment now counted), list column sticky and
  sized to the viewport, Refresh beside the Waiting count, review pane
  docked as an `EditorPanel` with one header and a sticky decision dock
  (see Conventions: triage workspace, decision dock).
- Duplication removed: section descriptions gone; the pane header skips
  title and pills for article and site feedback, whose own detail draws
  them (`detailHasHeading` on the source adapter). Urgency tone is one rule
  (`urgencyTone`: critical danger, high caution, low neutral).
- Rows: source glyph (registry icon), age as `<time>` via Home's
  `describeDay`, claimer only when claimed.
- Phone: selection scrolls the pane in; Back to list; pager; the dock is
  the thumb zone; idle pane hidden.
- Claims: the claim line moved into the dock, outline buttons, pending
  labels; claim, release and take over announce through an sr-only live
  region instead of a banner that repeated the line.
- Notices: live in the dock, clear when you pick another item, success
  offers Undo; new `u` undo through the adapters' `actions.undo`
  (`inboxSources.tsx`, trip reports and feedback, same routes and
  transition tables as the owning tools).
- Errors: one `LoadErrorState` for the whole read (`describeLoadFailures`
  in `inboxModel.ts`), one freshness line (`RailCountFreshness`), skeleton
  rows while loading, no zero counts for unknown queues, "Show everything"
  when filters hide all, "All clear" when nothing waits.
- Detail: fact labels use `type-meta-label`, one `DetailHeading` recipe,
  the article feedback correction panel folds behind an `ExpandButton`
  (`CorrectionReveal`, mounts on open), a stale recommendation says it can
  only be looked at again.
- Freeze: a refused write reads "Writes are paused, so that was not
  saved."; while frozen the dock shows one quiet line; buttons stay enabled
  so the next write can clear the freeze (disabling them would pin it).
- Journeys fixtures (`scripts/tools/journeys/fixtures.mjs`) now answer every
  Inbox read and write in-browser (`seedInbox`, `FIXTURE_OTHER_ADMIN`):
  trip reports, article/site/glossary feedback, citation queue, correction
  candidates, claims (one expired, one held by another admin on the seeded
  proposal), status posts. Rail count routes and review recommendations are
  unchanged (the capture script overrides them), so other tools' baselines
  do not move.

Deferred, with reasons:

- Display names for external reviewer emails: needs an admin directory the
  client does not have.
- Citation article titles instead of slugs: the citation queue route returns
  slugs only.
- Glossary item deep link from "Open in Glossary": the Glossary tool has no
  item route yet.
- Feeding the rail badge from the Inbox's loaded list: shell badge store.
- Remembered or URL filters: wants a shared saved-view convention.
- Implicit claim on decision: changes what the decision log records.
- "Open in <Tool>" through `guardedLinkProps`: tools do not receive the
  shell's `onOpenHref`; the unsaved-work registry's `beforeunload` still
  covers the navigation.
- Detector `ai-color-palette` findings: the brand accent, a brand decision.

