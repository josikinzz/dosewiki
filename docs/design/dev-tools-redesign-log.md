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
- **Editor workspace (list plus editing pane).** A tool that opens one record
  to edit uses the triage workspace layout with an editing pane: list left
  (`lg:sticky lg:top-24`, rows are `theme-dev-link-row` buttons, the open row
  gets `aria-current` plus `theme-dev-link-lead` and "Editing"), pane right as
  `EditorPanel className="overflow-visible"`. The pane header names the record
  (its saved title as the heading, sr-only "Editing"), carries the live link
  and one corner Close (`absolute`, `TOUCH_ICON`), and "Back to list" below
  `lg`. Desktop shows an idle pane that says what opens there; phones hide it.
  Opening moves focus to the pane heading from an effect (never a frame
  later, or a click into a field loses focus to it). My reports
  (`MyReportsTab`, `OwnedReportPane`) is the reference.
- **Save dock.** An editing pane's `sticky bottom-0` footer (the decision
  dock recipe, `aria-label="Save"`) holds, in order: the result of the last
  save as a `Notice` (success, refusal, conflict with its way forward), then
  Save (accent, pending label, key cap on fine pointers), a quiet discard
  button, a one-phrase state ("Unsaved changes" with the unsaved dot, "No
  changes yet"), and the tool's `SaveLine`. Such a tool sets `saveLine:
  "in-tool"`. Notices about the list (a failed open) stay at the list.
- **Save key.** Cmd/Ctrl+S in an editing pane opens the same confirm Save
  does (never saves past it) and is registered through `useDevShortcuts`
  ("Cmd+S"). Show the cap with `useModifierKeyLabel("S")`
  (`DevCommandPalette.tsx`; `usePaletteKeyLabel` now wraps it).
- **Conflicts offer the way forward.** A revision conflict says someone saved
  after you opened it and offers "Load the latest version" behind a
  destructive confirm that says the edits are dropped. A freeze refusal says
  "Writes are paused, so your changes were not published" and keeps the draft.
- **Confirms say what changes.** A publish confirm names the changed parts
  ("You changed the title and tags."); a grant of rights names who gets what.
- **Fields use `EditorField`.** Sentence-case labels and descriptions, never
  hand-rolled `uppercase tracking-wide` labels; a group of controls (tags, a
  body of phases) is a labelled group or a `fieldset` with a `legend`.
- **Dates in rows.** Event dates are relative `<time>` (`RelativeDay`); a
  calendar fact (a trip date) is written out in the body face and read in UTC
  (`formatTripDate`), never a mono ISO string.
- **Section descriptions** are capped at 75ch by `EditorSection` itself.
- **A failed read stays in the tool.** `useEditorRead` throws a read that
  fails before any data lands to the route error boundary, which drops the
  whole editor (rail included). A tool that draws its own failure reads through
  `useEditorReadState` (`src/hooks/useEditorRead.ts`: same key, route and
  freshness; returns `data`, `error`, `fetching`, `retry`) and renders
  `LoadErrorState` with `what`. A failure of a later page lands where that page
  would have (the end of the list), and what already loaded stays.
- **Feeds group by day.** A time-ordered feed puts its rows under local-day
  `h3` headings ("Today", "Yesterday", "Tuesday, Jan 13", the year when it is
  not this one) with a quiet count, and each row shows only the time of day in
  a `<time>` whose title is the full moment. `groupByDay`, `dayLabel`,
  `formatSaveTime` and `formatSaveMoment` in
  `src/features/dev/pages/changeLogModel.ts` are the reference.
- **Disclosure rows.** A row that opens in place (a diff, a detail) is one
  button wrapped in the row's heading (`h4 > button`, the accordion pattern):
  the summary is its name, `aria-expanded`/`aria-controls` carry the state,
  `ExpandIndicator` sits at its end, and the open row takes
  `theme-dev-link-lead`. Controls that belong to the item (filters, links,
  copy) live in the opened region, never beside the summary where they crowd
  it. `ChangeLogEntryRow` is the reference.
- **Active filters are chips.** When filters are on, a group labelled "Active
  filters, N" above the results shows one `TagToken variant="compact"` per
  filter with its own remove button ("Remove the article filter"), and the
  filter panel's heading carries "Clear all". A date range counts as one
  filter. Filter counts and "N shown" use the neutral tone, never warning.
- **Phone filter panels fold.** Below `lg`, search stays visible and every
  other filter folds behind an outline "Filters" button (`aria-expanded`,
  a `Badge` with the folded count) beside the search field; on desktop the
  panel is a sticky column. `ChangeLogFilters` is the reference.
- **Choice groups that do not fit one strip** (four date choices in a 17rem
  column) are a two-column grid of `pillActive`/`ghostPill` buttons with
  `aria-pressed` in the segmented control's capsule, not a strip that hides
  options behind a scroll.
- **New arrivals wait.** A list that refetches in the background holds items
  newer than the first load behind a line ("2 new saves landed since you
  opened this." plus "Show them"), so the list never shifts under the reader.
- **Search shows its matches.** Row text runs through `HighlightedText`, and a
  diff takes `DiffSurface`/`DiffPreview` `highlight` (new, optional) to mark
  the same terms.
- **`/` focuses the tool's search** (register it with `useDevShortcuts`) and
  the field shows a `theme-dev-kbd` "/" cap on fine pointers while empty, with
  `aria-keyshortcuts`. `j / k` walk a list's rows by focus when the rows are
  disclosures rather than a selection.

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

### Pass 4: My reports (`/dev/my-reports`)

Commit: see `git log --grep "Dev tools redesign: My reports"`.
Screenshots: `tmp/redesign/my-reports/before/` and
`tmp/redesign/my-reports/after/` (admin, contributor, editor; loaded dark and
light; empty; failed; loading; open, open with a body, scrolled, dirty; publish,
discard, assign and load-latest dialogs; saved; conflict; frozen; open failed;
assign filled, done and failed; edit from a submission; desktop and phone),
captured by `tmp/redesign/my-reports/capture.mjs`. Critique in
`tmp/redesign/my-reports/critique.md` (17/40 before), inventory with the
item-by-item check in `tmp/redesign/my-reports/inventory.md`, detector
evidence in `tmp/redesign/my-reports/detector/`.

Main changes:

- Layout: the editor workspace (see Conventions). The list of owned reports
  is link-row buttons with address, trip date and relative publication; the
  open report docks on the right with a sticky save dock that really sticks
  (the old footer sat inside an `overflow-hidden` panel). Phones: opening
  scrolls the pane in and focuses its heading; Back to list returns.
- Save results land in the dock; the conflict offers Load the latest version;
  freeze reads plainly; the confirm lists what changed; Cmd/Ctrl+S; Revert is
  "Discard edits"; duplicate tags are skipped; the add-tag box is 16px on
  phones; the registry now says `saveLine: "in-tool"`.
- Split into `OwnedReportPane.tsx`, `SubmissionsSection.tsx`,
  `AssignOwnerSection.tsx`; model helpers `formatTripDate`,
  `normalizeReportSlug`, `isRevisionConflict`, `isWriteFreezeRefusal`,
  `submissionOutcome`, `sortSubmissions`, `changedParts`, `joinParts`.
- Submissions: an open list (not a table), newest first, a tally in the
  heading, relative submitted and decided dates, "Edit your report" on a
  published submission the member owns, "Submit a revised report" on a
  rejected one, capped at five. A member who owns nothing sees Submissions
  first. Empty states point onward (`/reports/submit`, See your submissions).
- Assign owner: `EditorField`s that stack on phones, a pasted page address
  resolves to its slug with a preview, a confirm names the email and slug
  before posting, the result shows under the button.
- Loading is skeleton rows; each read's failure is one `LoadErrorState` with
  `what`; Refresh reloads both reads.
- Shared, backward compatible: `TagToken` remove gets `TOUCH_HALO`;
  `EditorSection` caps its description at 75ch (every tool);
  `PortalReportTimelineEditor` draws its move arrows as icons and its entry
  count in the body face (labels unchanged); `useModifierKeyLabel`.
- Journeys fixtures: owned report records (`OWNED_REPORT_SEED`, three
  reports, one with a body, one with no trip date), the record route (GET and a
  POST honoring `conflicted` and `frozen`), the owner route (404 for unknown
  slugs), and six submissions covering every status. Home's "Your trip
  reports" reads the same seed, so its screenshots now show more rows.

Deferred, with reasons:

- Undo or restore after publishing, and whether owner edits should be pending
  revisions: needs server history and a product decision.
- Deep link to an open report and palette records for owned reports: the
  shell owns tool routes; wants the shared deep-link convention.
- Slug combobox with titles and current owner in Assign owner: the only list
  is the full portal corpus read, which carries no owner; needs an endpoint.
- Accepted and Published share the success tone: shared intake vocabulary.
- Timeline editor duplicate "+ entry", textarea heights and the "Conclusion /
  Aftermath" label: the Trip reports pass (labels are test-guarded there).
- Next dev overlay "1 Issue" on every `/dev` page is a pre-existing hydration
  attribute mismatch in the shell, not this tool.

### Pass 5: Change log (`/dev/change-log`)

Commit: see `git log --grep "Dev tools redesign: Change log"`.
Screenshots: `tmp/redesign/change-log/before/` and
`tmp/redesign/change-log/after/` (admin, editor, editor_translator, locked
translator and contributor; loaded dark and light; empty server; failed;
loading; loading older; older page failed; long lists; open save; open bulk
save filtered to one article; open all; copied and copy failed; article,
submitter, custom reversed and quick date filters; search; filtered empty with
and without older saves; phone Filters open; keyboard focus; desktop and
phone), captured by `tmp/redesign/change-log/capture.mjs`. Critique in
`tmp/redesign/change-log/critique.md` (16/40 before), inventory with the
item-by-item check in `tmp/redesign/change-log/inventory.md`, detector
evidence in `tmp/redesign/change-log/detector/`.

Main changes:

- P0: saves that touched many articles no longer crush their text column to
  one character on desktop. Articles read as words on the row ("Caffeine,
  Nicotine, Alcohol and 11 more"); per-article filter and public-link chips
  moved into the open save, capped at six with a count reveal.
- A failed feed read renders in the tool (`LoadErrorState`, Try again) instead
  of replacing the editor with the route error page; the bundled archive stays
  listed and says so. A failed older page lands at the end of the list.
- Loading shows skeleton rows instead of passing the archive off as the feed;
  saves only in the bundled archive are marked "Archive"; an empty server
  history says so; a truly empty log points to Substances.
- Layout: a 17rem sticky filter column and a day-grouped feed of disclosure
  rows (see Conventions). The four header pills became one summary sentence
  ("30 saves, newest first. Most edited: Ketamine (7 saves).", the article a
  filter link); "N shown" moved to the end of the list with the one paging
  slot ("Show 20 more", then "Load older saves", then the cap line).
- Filters: `SearchablePicker` for Article (with save counts) and a new Saved
  by filter (names from the contributor directory, which the tab now reads:
  `data: ["changelog", "contributors"]`); date as a pressed-state group (Any
  date, Past 7 days, Past 30 days, Custom) with From/To only for Custom, `min`
  and `max`, and a "Swap the dates" hint for a reversed range; removable
  chips; one "Clear all". A date range counts as one filter. Search also
  matches the row's words and the saver, and matches are highlighted.
- Open save: "Open <Article> in Substances" (accent link) when the save has
  one article or the list is filtered to one, Copy diff and Download .diff as
  outline buttons, "Commit" link, feedback under the actions, and the diff cut
  to the filtered article's part (`sliceArticleDiff`) with "Show the whole
  save".
- Copy: "Saves" and "Filters" instead of three names; "editor" instead of
  "Dev mode"; `Added a source "Title" in Sources`; savers by display name;
  line counts in the body face with a zero side dropped.
- Keys: `/` search, `j / k` next and previous save (in the `?` sheet).
- Split into `ChangeLogFilters.tsx`, `ChangeLogEntryRow.tsx` and
  `changeLogModel.ts` (with tests); the controller gains `submitter`,
  `submitterOptions`, `handleSubmitterSelect`, `setSearchQuery`,
  `setDateRange`; `ChangelogFeedWindow` gains `error`, `retrying`, `retry`,
  `archivedIds`.
- Shared, backward compatible: `useEditorReadState` in
  `src/hooks/useEditorRead.ts`; `DiffSurface`/`DiffPreview` `highlight` (kit
  story added).
- Journeys fixtures: `buildChangelogFixture` and `/api/editor/changelog`
  (limit honored, capped at 500; `changelogRows` option; empty and failed
  states), with a unit test.

Deferred, with reasons:

- Dose, duration and interaction markers (and a filter for them) on bulk
  saves: the stored diffs carry no field paths, so a changed `"min": 50` line
  cannot be told apart between a dose range and a duration stage, and
  interaction entries are bare strings. A marker would miss changes and read
  as "nothing safety-related changed". Needs the save to store touched paths.
- Filters in the URL: wants the shared saved-view convention (as the Inbox
  pass recorded).
- Server-side filtering past the 500-row cap, and a summary-only feed that
  fetches a diff on open: backend.
- Revert from the change log: needs server history and a product decision.
- A docked diff pane (triage workspace): declined; a log is read as a stream
  and "Open all" compares saves down the page.
- `pushNotice` still has no caller; the page notice it feeds is kept.

