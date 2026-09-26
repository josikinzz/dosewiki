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
  refresh failed (hollow, `theme-dev-count-badge[data-stale]`) and `atLeast`
  for a sum with a part that never loaded ("13+", spoken and titled "at least
  13", the way Home's `CountValue` says "At least 13"; Pass 22). The shell
  sets `atLeast` on the Inbox roll-up from the same readings `sumHomeCounts`
  reads, so the rail and Home never disagree about a floor.
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
  any sheet (it silently renders body text; no tool uses it any more).
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

- **Pills in phrasing content.** A status pill inside a row button, a
  label or a sentence passes `EditorStatusPill inline`, which renders the
  Badge as a `span` (a `div` inside a `p` or `button` is invalid and React
  reports it as a hydration risk).
- **Write results land where the write was made.** A tool with several places
  that write keeps one result notice and routes it: the save dock while an
  item is open, the list heading when nothing is open, the detail pane of a
  second view (Coverage) when the write came from there. Never a page-top
  notice above the fold.
- **A failed write under the freeze reads as the freeze.** When a tool's write
  helper reconciles a 5xx into its own words, mark the notice as a failed
  write and, while `useWriteFreeze().frozen`, show "Writes are paused, so your
  changes were not published." instead, keeping any retry action.
- **A global setting lives apart from the item being edited.** A control that
  changes every record (the banner glyph size) sits in its own labelled
  section outside the editing pane, asks before it saves, and names the old
  and new value in the confirm.
- **Confirm headings over affected lists** pass `affectedLabel` to
  `ConfirmDialog` ("Shows on 5 substances") instead of the default "Affects N
  rows".
- **One pane, two save models, said out loud.** When part of a pane publishes
  with the dock's button and part writes on its own confirm, each block gets a
  one-word meta label and a plain sentence beside it ("Switches: Publish with
  the preset", "Substances: Each change goes live when you confirm it"), never
  a sentence-length uppercase label.

- **A tool's own save sentence.** When none of the three save models says
  what a save does (Playlists stores a playlist and publishes nothing), set
  `saveLine: "in-tool"` and pass `SaveLine copy={...}` (a `SaveLineCopy`,
  now exported); the write freeze still replaces it.
- **Address sync keeps Next's state.** A tool that mirrors its open record in
  the address calls `window.history.replaceState(window.history.state, "",
  path)`. Passing `null` makes the App Router treat it as a navigation that
  scrolls to the top (and can re-render the route with new params). A deep
  link's keyed read is never cancelled by the address changing under it; a
  later request wins by counter, and a failed deep link drops its key from
  the address.
- **Reorderable rows.** An ordered list of media drags by a handle that also
  shows the position (`@dnd-kit` pointer, touch long-press and keyboard
  sensors, with announcements that name the item), keeps Move up / Move down /
  Remove icon buttons from `sm` up, and folds them into a per-row "More for
  <name>" menu on phones (which adds Move to the top / Move to the end), so
  the title keeps its width. Every move and removal is announced in a polite
  live region and focus stays on the moved row (or the next row after a
  removal). `PlaylistWorks.tsx` is the reference.
- **Keep focused fields clear of the dock.** An editing pane with a sticky
  dock gives its body `[&_:is(input,button)]:scroll-mb-40
  [&_:is(input,button)]:scroll-mt-28`, so a field scrolled to by focus or
  search is not hidden under the dock or the public header.
- **Read-only records open read only.** A record the member may read but not
  change opens in the same pane with no dock, a lock line naming who can
  change it, and a way to make it theirs (Playlists: "Copy into a new
  playlist"). The row says "Read only" and "Viewing" when open.
- **Confirm descriptions are plain text.** `ConfirmDialog` wraps
  `description` in a `<p>`; a list or paragraphs go in `body`, or React
  reports invalid nesting (the dev overlay's issue count climbs).
- `ReplicationThumb` takes `compact` for small row wells: the missing-media
  placeholder drops its tracked type word (sr-only instead).

- **A tool with several jobs splits into views, all kept mounted.** When one
  tool holds distinct jobs (People: members, invites, the role guide), an
  `EditorNavTabs` strip under the section heading switches `role="tabpanel"`
  panels that stay mounted and hide with `hidden`, so a staged change or a
  half-filled form survives a switch. Counts ride on the tabs as a number
  with sr-only words ("Invites, 2 open"); a view is addressable with a hash
  (`/dev/people#invites`), written with `replaceState(window.history.state,
  ...)`. Reference: `PeopleTab`.
- **Three filter views in a narrow column** are a three-column grid of
  `pillActive`/`ghostPill` buttons (label over count, `aria-pressed`) in the
  segmented capsule, so all three fit a phone without a scroll strip
  (`ViewChoices` in `PeopleTab`).
- **Secrets shown once ask before they are dismissed uncopied.** A one-time
  value (password reset link, invite code) closes at once after a copy; before
  one, Dismiss swaps the actions for "Close without copying? ... cannot be
  shown again." with "Close it" and "Keep it". Reference: `useMemberActions`
  reset card, `InviteCodesPanel` reveal.
- **Results are scoped to their record.** A hook that reports writes on
  several records keeps the record with the notice and renders it only in that
  record's pane (`useMemberActions().noticesFor(email)`), under the buttons that
  made it; picking another record never shows the last one's result.
- **Grant changes say from and to.** A staged permission change shows one line
  beside Save ("From Editor to Editor + Translator (Dutch), once you
  confirm.", `describePermissionChange` in `membersModel.ts`) and the confirm
  names the old grant too.
- **A person reads as initials.** `Monogram` (`people/PersonPane.tsx`) draws
  `theme-dev-avatar`; `data-kind="profile"` draws it open (dashed) for a
  record nobody signs in to.
- **Invite forms default to the least grant** (Contributor) and say what they
  will create in one live sentence above the button (`describeInviteTerms`).
- **Write access mirrors the server rule.** When the route refuses some
  records to a role (an editor below admin saving another member's profile),
  the tool reads the same rule in the browser (`canWriteContributorProfile`,
  a copy of `canEditContributorProfile`, fed the viewer address from the
  shell's `userEmail`) and opens those records read only: fields disabled in
  one `fieldset`, no dock, a lock line naming who can change it, orders read
  only, admin-only operations as a sentence. Without the viewer address the
  tool leaves the record open and the route decides.
- **Saving one part never drops another.** A pane with several independent
  saves reloads only the part that saved (`reloadParts` in
  `useContributorsController`): an order save keeps an unsaved profile edit,
  and "Load the latest version" of one part leaves the others alone.
- **Destructive operations fold shut.** Rarely used, irreversible operations
  sit at the end of the pane under one disclosure (`h4 > button` with
  `ExpandIndicator`, kept mounted with `hidden`), keyed on the record so a typed
  confirmation never carries to another record. The typed key has no
  placeholder (a placeholder shows the answer) and says "That does not match"
  while wrong. Reference: `ContributorDangerZone`.
- **Avatars are drawn as the public page draws them.** Rows, pane headers and
  previews of a public profile use `ContributorAvatar`
  (`@/components/layout/PublicPagePrimitives`), so the circle crop is the one
  readers see; `Monogram` stays for accounts.
- **A blocked save says why, per row.** Form rows that the server would drop
  silently (a half-filled or non-https link) carry their own problem line and
  `aria-invalid`, and the dock's blocker names the row ("Link 2: ..."). Pure
  rules live in the tool's model (`profileEditModel.ts`).

- **Rows in a windowed `EditorList` may differ in height.** The list measures
  each mounted row, keeps its height by key and positions rows by prefix sums,
  and a selection's reveal corrects itself a bounded number of times as rows get
  measured (Pass 22; the old shared pitch taken from one row flipped as the
  window moved and could loop until React stopped it). Pass an
  `estimateRowHeight` close to the typical row plus the option's 4px gap. A
  list whose rows would jitter by a few pixels (a pill on some rows) may still
  pin them for rhythm (`h-[3.75rem] overflow-hidden` on `EditorListRow`, as
  Copy and Substances do), but it is a visual choice, not a workaround.
- **Sections in a narrow list column** are a three-column grid of
  `pillActive`/`ghostPill` buttons (label over count) in the segmented capsule
  (`SectionChoices` in `CopyStudioTab`, after People's `ViewChoices`), and a
  tier with more than four options under them is a labelled `EditorSelect`
  with counts, not a tab strip that wraps or hides options sideways.
- **Twins sit together.** A record with another publication's wording
  (`footer-tagline` and `footer-tagline-effect-index`) is listed straight
  after its base, and the pane links to the other wording
  (`groupCopyStudioBlocks`, `copyBlockTwin`).
- **Open proposals show on the record.** A tool whose editors submit
  proposals reads `GET /api/dev/proposals` (an editor sees their own, an admin
  everyone's), marks the rows and says in the pane who proposed what with
  "Open in Change Review", so a reload does not forget a submission and an
  admin does not publish over one unknowingly (`openCopyProposals`).
- **A draft that drops what the page fills in says so.** Placeholder changes
  against the live text are warned beside the field ("You removed
  {{siteName}}. The page will no longer fill it in.", `placeholderChanges`).

- **A preview of a public page embeds it.** A pane that previews a public
  page renders the page component in its embedded form: no `main` landmark or
  `main-content` id (a second one broke the skip link), and one column laid out
  on the preview's own width, since page breakpoints read the viewport.
  `EffectIndexArticlePage embedded` (contents listed above the article) and
  `WritingBlogPostPage embedded` are the reference.
- **Fields beside a preview switch views.** A pane with a live preview carries
  an `EditorSegmentedControl` "View" (Write / Preview / Both): Both is side by
  side from `xl` with the preview sticky and scrolling on its own, stacked
  below; wide screens open on Both, phones on Write. `WritingPane` and the
  About pane are the reference.
- **The save button names the outcome.** When one button can publish,
  republish, keep a draft or take a page down, its label follows the draft
  (`writingSaveAction`: Publish, Publish changes, Save draft, Unpublish) and
  the confirm's title and consequence sentence say the same.
- **A pane where something is always open has no Close.** Writing always
  shows a record (About when nothing else is picked), so the pane header keeps
  Back to list below `lg` and drops the corner Close.

- **A batch tool owns one Working changes panel.** A tool whose edits collect
  for one commit (Tags) draws its own panel from `commitControls`
  (`DevCommitControls`, returned by `useDevModeSaveActions` beside the
  unchanged `commitPanel`): the state in one sentence ("2 articles changed, not
  live yet"), the accent commit button in the section's actions with the Cmd+S
  cap (outline while off), the server check, why a commit waits, the rebase
  banner, the last result kept as a receipt until dismissed (the hook clears
  successes after five seconds), what changed in the tool's own terms, and the
  full diff folded shut with Copy and Download. It never repeats the frame's
  batch sentence, and it renders `commitControls.dialog`. The editing pane's
  dock says how much waits ("2 articles in your working changes, not live
  yet") with "Review and commit", which scrolls to the panel and focuses its
  heading. The frame is shared: `DevWorkingChangesPanel`
  (`src/features/dev/pages/DevWorkingChangesPanel.tsx`) takes the controls, a
  pending and an idle sentence, the tool's change list, an optional
  `describeFailure` (reword a refusal the tool understands and offer its way
  forward) and the diff parts. Tags (`WorkingChangesPanel`) and Index layout
  compose it; nothing in the shell renders `commitPanel` any more except as a
  fallback for a bare mount.
- **Commit confirms speak the tool's terms.** `requestCommit(lead)` puts a node
  at the top of the commit sheet (`CommitScopeSheet` `lead`); Tags passes its
  tag changes ("Benzos, renamed from “Benzodiazepines”, on 2 articles"). With
  only articles in scope the button says "Commit changes to 2 articles".
- **Say what an action will do before it runs.** When a write's effect depends
  on what already exists (a rename onto a label that exists is a merge), a live
  line under the field says so with the combined count and the button takes the
  outcome's name ("Merge into “Benzodiazepine”"). Likely duplicates are offered
  as one-tap actions that fill the field. A button whose input would be
  refused (an empty or unchanged label) is off, with the reason in that line.
- **A result stays with the record it changed.** When a write removes the
  open record and the list falls back to another, the pane stays on the
  removed record (struck through, its result and Undo in the dock) until the
  editor picks something else.
- **Several kinds of change to one record are kept-mounted views.** An
  `EditorNavTabs` strip ("Rename or merge", "Move", "Remove") over
  `role="tabpanel"` panels hidden with `hidden`; one result slot in the pane
  dock serves them all. A removal is a view whose button opens a destructive
  `ConfirmDialog` naming the record and listing the affected rows
  (`affected`, `affectedLabel`), not an always-open red zone with a checkbox.
- **Four filter views in a narrow column** are a two-by-two grid of
  `pillActive`/`ghostPill` buttons (label over count, `aria-pressed`) in the
  segmented capsule (`TagListColumn`). A search with no match in the current
  view offers the views that do match ("Found in Chemical class (1)").
- **A pane says when the list's filter hides it** ("Your search hides this tag
  from the list" with "Clear the search"), so actions never run on something
  the list no longer shows without saying so.
- **A pending state inside a dock is a quiet live line** (spinner and words in a
  `p aria-live`), not a second `Notice`, so the result that follows replaces it
  without two status regions.

- **Status-claimed queues show a hold line.** A queue whose claim is its
  Reviewing status (feedback, trip reports) reads who holds each item from the
  decision log (`holdOf` in `src/features/dev/tools/feedback/feedbackReviewModel.ts`:
  open, mine, other, unknown, decided with who and when) and draws it as the
  first dock line, the Inbox's `ClaimStrip` recipe: Claim on New, Release when
  it is yours, "Claimed by X" otherwise, and on a decided item "Resolved by you,
  2 days ago. Reopen it to decide again." with Reopen. Claim and Release are
  announced in a polite live region, not a notice; Reopen is a decision with
  Undo. Decisions a decided item cannot take are hidden, not a row of disabled
  buttons. Rows name the holder ("You", "Claimed by X").
- **More than three decisions fold into a menu.** The dock keeps the primary
  and the two common negatives as buttons (Resolve, Reject, Mark as spam, with
  key caps); explicit outcomes (Duplicate, Explanation provided, No change
  needed) sit in a ghost "Close as" `DropdownMenu` whose items say what each
  records ("Resolves it: you answered the reader."). `FeedbackReviewPane` is the
  reference.
- **Seven statuses in a narrow column** are a four-column grid of
  `pillActive`/`ghostPill` buttons (waiting work first, then the decided
  history, label over count; `FeedbackStatusChoices`). The spoken separator is
  `<span className="sr-only">,</span> {count}` with the space outside the
  sr-only span, so the name reads "Spam, 1" (a trailing space inside it is
  trimmed to "Spam,1").
- **Waiting work opens most important first** when readers rate importance
  (critical, then oldest within a level); history opens newest first. A named
  view that asks for oldest first keeps it.
- **A search with no match here says where the matches are** when the counts
  come from the same search ("Found under Spam (1)", each a link that switches
  the filter), plus "Clear the search".
- **Facts about an intake item** are a `dl` of `type-meta-label` terms over
  body values (`FeedbackFacts`, `src/features/dev/tools/feedback/FeedbackFacts.tsx`),
  links carrying their own glyph (mail for a reply, arrow for a new tab). The
  reader's own words sit in a quiet well under "What they wrote", never in a
  fact cell.
- **The pane of a queue hides on phones until a pick**; the automatic first
  row is a desktop convenience. Tapping the automatic row counts as a pick
  (pins it, scrolls the pane in). `useScrollToDetail` keys on the picked id, so
  the automatic row never scrolls a phone.

- **An authority decision says what it will do before the click.** The dock
  shows the one reason a decision is off (your own proposal, no verifiable
  comparison, a missing rejection note with "Write the note") and, when the
  live content moved, what approving will do instead ("Approving will return
  it for revision instead of publishing"). The buttons keep their tested labels;
  keys go through the same guards as the buttons and still open the confirm
  (`approveBlocker`, `describeDrift` in `queue/queueModel.ts`).
- **A required note lives in the body, its decision in the dock.** A decision
  that needs words (Reject) stays off until the note has text, says so under
  the dock's buttons, and `n` or "Write the note" focuses the field at the end
  of the pane; `r` with an empty note focuses it instead of asking.
- **Claim-table queues read the Inbox's claims.** A tool whose items the Inbox
  claims through `/api/dev/inbox/claims` (proposals, citations,
  recommendations) reads the same list and draws the hold line (Claim, Release,
  "Claimed by X"), names the holder on rows, and treats a failed claims read as
  unknown. Claims stay advisory: they never disable a decision.
  `fetchProposalClaims`, `writeProposalClaim`, `proposalHoldOf` are the
  reference.
- **A result offers the next item, it does not move you.** After a decision
  goes through, the dock's notice keeps the pane on the decided item and
  offers "Next waiting: <summary>" (never after a refusal).
- **Bulk sign-off keeps who asked and why in the confirm.** A confirm over
  several recommendations lists each title with its recommender and note in
  `body`, not bare titles in `affected`.
- **A shared review body splits into parts.** When a component renders both in
  a tool pane and inline elsewhere (`ProposalReview` on the article page),
  export its sections (`ProposalFacts`, `ProposalFeedback`, `ProposalTargets`,
  `ProposalChanges`, `ProposalDiscussion`, `ProposalOtherEditors`,
  `ProposalNextStep`, `ProposalTime`) and keep the composite for the other
  consumer, with flags for what the pane header already says (`showStatus`,
  `showProposer`, `showDrift`).

- **One list, two kinds of record, two docks.** When a queue and the corpus it
  feeds share one list (Trip reports: submissions and published reports), a
  row opens the pane its kind needs: a review pane with the decision dock, or
  an editing pane with the save dock. Rows say which kind they are when the
  title alone could mislead ("Submission · ..." on a submission that became a
  report), and each pane links across ("Open the published report").
- **A triage list column folds every filter but search at every width** when
  the pane beside it needs the width: an outline "Filters" button with the
  folded count (`aria-expanded`, the `ChangeLogFilters` badge recipe) opens a
  panel holding the order, the grouping and multi-value facets
  (`SearchableMultiPicker`, counts as the option hint, counted within the view
  on screen). While the panel is shut, active facets show as removable chips
  with "Clear all". `PortalListColumn` is the reference.
- **Picking from a listbox keeps focus in the list.** The arrow keys must keep
  walking it, so a pick from the list never moves focus; the pager, j/k, "Next
  waiting" and links across move focus to the pane heading (from an effect).
- **A publish shows what goes public before it asks.** A button that makes
  something public first builds the preview the route offers (a write that
  publishes nothing) and puts it in the confirm's `body` (address, byline,
  attribution, what is included); the button reads "Checking" meanwhile. A
  preview never replaces the record it previews, so nothing reads "Nothing is
  public yet" after a publish.
- **A missing permission blocks the public step, with the reason.** When the
  record says its author did not agree (trip report `publish_consent`), the
  publish button is off and the dock says why, and the fact reads as a warning.
  The tool is stricter than the route here on purpose.
- **Text boxes that hold prose grow with their words** (`[field-sizing:content]`
  with a `max-h-[70vh]` cap and 16px on phones), so a long account never
  scrolls inside a small box. `PortalReportTimelineEditor` is the reference.
- **A count that cannot be known speaks.** A view choice whose source failed or
  is loading drops its number and carries sr-only ", not loaded", so its name
  never reads as a zero.

- **A write route without a revision check reads first.** When a tool's write
  route takes no expected revision (citation status), the tool re-reads the
  records it is about to change, compares what it showed (status, note, time),
  and refuses with "Someone changed one of these rows after you opened it, so
  nothing was saved. The latest is on screen now" (a warning in the dock) when
  any moved. Undo refuses the same way when a row was decided again since
  (`rowsChangedSince`, `rowsMovedSinceDecision` in
  `src/features/dev/tools/citation-review/citationPaneModel.ts`).
- **A decision never moves the row it decided.** A list whose order depends on
  status (accepted last) holds the order rows first appeared in until the
  reviewer refreshes or opens another record, so the result and its Undo stay
  where the eye is.
- **Per-row decisions inside an item keep their result in the row; the dock
  holds the item-wide decision.** When one item holds many sub-decisions
  (evidence rows in an article), each row keeps its buttons, result and Undo;
  the pane's dock holds the result notice, the hold line and the item-wide
  action (approve the set) with its one reason and a way to satisfy it ("Open
  the next unread row", `o`). A decision that drains the item from the filter
  keeps the pane on it with "Next waiting".
- **A gate that asks the reviewer to read first offers the next unread.** When
  a bulk action unlocks only after each part was opened, the dock names the
  count ("1 of 4 opened"), rows carry an "Opened" mark, the opened set is kept
  per record for the session, and a button and key open the next unread part.
- **Registry corpus needs are honoured by the route.** `NextDevRouteClient`
  starts the library drain for every tab `tabNeedsLibrary` names (blocking
  `library` and `library-deferred`), not a hard-coded list; a tool that needs
  article titles or whole articles says `library-deferred`.

- **A board edits by menu as well as by drag.** A drag-and-drop editor gives
  every drag a menu path that works on a phone: each row's "More actions for
  <name>" menu opens with the row's name and place ("2 of 3 in Psychedelic,
  Common") and holds Move up, Move down, Move to the top, Move to the end,
  "Move to another list" and Remove. Up and down arrows show on fine pointers
  only (on hover or focus); touch gets the grip and the menu with 44px halos.
  Sensors are `MouseSensor` (4px), `TouchSensor` (hold 180ms, 8px tolerance,
  so a swipe still scrolls) and `KeyboardSensor`, with announcements that
  name the substance and the list, never an id. Reference:
  `src/features/dev/tools/index-layout/LayoutDrugRow.tsx`, `IndexLayoutBoard.tsx`.
- **Pick a destination from a list, not a submenu.** A move to one of many
  places is a dialog with a filter, destinations grouped under meta-label
  headings as link rows, the current place "Here now" and places that already
  hold it "Already here" (both off). Radix submenus open off the side of a
  390px screen. Focus goes to the moved row afterwards (`onCloseAutoFocus`
  plus a `data-row` lookup). Reference: `LayoutMoveDialog.tsx`.
- **Undo steps have names.** A tool with its own undo trail records a label
  per step ("Moved LSD to Dissociative"), shows the last one in a polite line
  in its dock ("Undid: moved LSD to Dissociative."), puts it in the Undo
  button's title, and forgets the trail after a commit or submission (the
  draft is the new starting point). `useLayoutHistory` (`edit(transform,
  label)` returns whether anything changed; `undoLabel`, `redoLabel`,
  `forgetAll`).
- **A board carries a history dock.** An editing surface with no single
  record keeps Undo, Redo (key caps on fine pointers), the last change and
  "Review and commit" (scrolls to Working changes, focuses its heading) in one
  `sticky bottom-0` region labelled "History", the decision dock recipe. It
  replaces a sticky top toolbar, so phones get Undo in the thumb zone.
- **A reader's tab strip folds to a select on phones.** When a tool mirrors a
  public strip that wraps to many rows below `md`, it shows the strip from `md`
  and one labelled `EditorSelect` below.
- **Find it on the board.** A large editable surface gets one search ("Find a
  substance on the board", `/`) that lists where each match lives and focuses
  the row on a pick (switching to a view that shows it), or opens the list
  picker for one outside the board.
- **Hidden things say so where they are offered.** A picker that can stage a
  hidden record for release marks it ("Hidden on the site" in the option hint);
  a row's menu explains its issue pill in words.

- **Many small decisions in a row stay rows, not a pane per item.** When a
  review is dozens of short, independent decisions (glossary terms), the
  workspace puts the groups on the left (link rows with a count left and a
  thin progress bar) and the open group's rows in the pane, each row editable
  in place with the English beside the translation, so focus can move to the
  next row needing review after each write. The group's bulk actions sit in its
  heading; the pane's dock holds only whole-list results, what is running, and
  the way on to the next group. `TermsWorkspace` is the reference.
- **In a list of many rows, only the edited row carries the accent.** A clean
  row's Approve or Confirm is outline; an edited row's Save and approve is
  accent. A main action that cannot run (a missing reason) is drawn outline
  while off, never a dimmed accent (`ApprovalActions` `quiet`).
- **Pressed-state choices are neutral, not accent.** Reason chips, modes and
  filters use `pillActive`/`ghostPill` in the segmented capsule; accent is for
  the action.
- **A tool with sections inside one view** (Articles: Reader, Coverage, Recent
  changes, Reader feedback, Runs) uses an `EditorSegmentedControl` under the
  view's tab, sections mounted on first open and kept mounted; the address can
  carry the section through the view names the deep-link parser already knows.
- **One assigned choice is a fact.** A picker with a single option (a
  Translator's one language) renders as a labelled value, not a one-option
  select.
- **Links from a tool pane to a public page open in a new tab** (with sr-only
  "(opens in a new tab)"), so the unsaved-work registry never has to catch a
  same-tab navigation it cannot see.
- **A write refused under the freeze or by a revision check is typed at the
  client.** A tool whose requests go through `devFetch` builds a small refusal
  error in `onError` (`GlossaryWriteRefusal`: `frozen`, `conflict`) and one
  helper words it (`describeWriteRefusal`), so every surface of the tool says
  "Writes are paused, so that was not saved." and offers "Load the latest
  version" on a conflict the same way.

- **A touch canvas is locked until Draw.** A drawing surface that claims every
  touch (OpenChemLib sets `touch-action: none`) shows on phones behind a shield
  child, so a swipe over it scrolls the page; an outline "Draw on the canvas"
  toggle under it (and "Tap to draw" on the shield) unlocks drawing, which also
  brings the tap-driven modes (bond pick, bold) and the tracing image, and
  "Done drawing" locks it again. Tool strips over the canvas scroll sideways
  below `sm` instead of wrapping. Reference: `MoleculeEditorWorkbench`
  (`TouchShield`).
- **A publish that replaces a picture shows both.** The confirm's `body` puts
  "Live now" (the stored image) beside "After publishing" (what Save would
  send), says what changed, and turns destructive when the change is more than
  cosmetic (Molecules: changed chemistry). Reference: `MoleculePublishReview`.
- **A tool whose save model differs by mode says it per mode.** Molecules sets
  `saveLine: "in-tool"`; the dock's `SaveLine` keeps the instant sentence for
  live depictions and takes `TEMPLATE_SAVE_COPY` for private templates.
- **A preview that mounts a whole public page sits in its own error boundary**
  with a fallback that says the unsaved work is untouched and offers Try again,
  so a page that cannot render never drops the editor.

- **An editing layer shared with the public page takes its tool chrome by
  prop.** `ArticleContextBridge` (`.editor.tsx`, replaced by a pass-through in
  the public build) draws the full-width editing bar by default (public page,
  Review) and, with `chrome="dock"`, the tool's pane: a `header` slot, a
  session strip over the article (`SessionStrip`/`SessionLine`), the article in
  its own error boundary, and a save dock (`SaveDock`, `DockBlocker`,
  `DraftStatePhrase`, `ButtonKeyCap` in
  `src/features/article/editing/ArticleWorkbenchChrome.tsx`). New optional
  props on shared editor-only primitives stay opt-in, so the public page's
  editor keeps its layout; the public build never reaches any of these modules
  (`scripts/build/public-editor-boundary.mjs`).
- **Safety-critical values show what readers see now.** A section form
  editing doses or durations reads the live article through
  `PublishedArticleProvider` (`src/features/dev/forms/PublishedArticleContext.tsx`,
  fed by `ArticleSectionForm published`) and writes "Live: 50-150 ug" with the
  unsaved dot under every changed value, matching routes by name, not index.
- **Checks that advise, beside the group they read.** Dose and duration
  warnings run on the committed values (fields commit on blur) and sit under
  their group in a polite live region: the unit each tier uses and which tier
  broke the one-unit rule, a tier out of order, a tier reaching past the next
  one's start (touching tiers are the house style), a change more than double
  or less than half of the live value, a stage longer than the total, a
  duration without a time unit (`doseRouteChecks.ts`). Interaction tiers warn
  when one substance sits in two of them (`interactionChecks.ts`). The server
  validation still decides; these never block.
- **The confirm of a safety-critical publish is the safety diff.**
  `PublishSheet` takes `lead` (a warning `Notice` at the top of the sheet
  naming the dose, duration and interaction changes), `confirmBody` (the
  changed sections in words, every such change before and after through
  `ArticleChangeDiff changes`, and "Still to check" with the warnings),
  `confirmAffectedLabel`, `confirmDestructive` (while warnings stand) and
  `result` (a refusal lands under the Publish button that was pressed). All
  optional; the Publish confirm keeps its test-guarded title and button.
- **A write refused by the freeze is definite.** `useArticleLifecycle` reads
  a 503 `DATA_WRITES_FROZEN` (and every 4xx) as a refusal that wrote nothing,
  clears the held request and exposes `failure` (`frozen`, `conflict`,
  `refused`, with the action), so no Retry of an impossible write locks
  editing; a lost or 5xx answer stays unconfirmed with Retry
  (`classifyLifecycleFailure`, `describeLifecycleFailure` in
  `articleSessionModel.ts`).
- **A long form in a panel pins its actions.** `ContextualEditorPanel` takes an
  optional `footer` (rendered under the scrolling body) and `onKeyDown` (keys
  the panel handles before it stops propagation). Section forms put Apply to
  preview (accent), Review, Save draft (Cmd+S) and Cancel there, with the
  validation list above them.
- **Guard dialogs wrap their buttons** (`useDirtyGuard`'s footer wraps and its
  buttons grow), so "Save draft and continue" is never clipped.
- **A tool whose corpus failed to load says so.** `NextDevRouteClient` passes
  the library's error to the shell (`libraryError`, `onRetryLibrary` on
  `DevModePageProps`; `libraryError`, `retryLibrary` on the controller), and a
  waiting corpus tool shows `LoadErrorState` "Could not load the articles"
  with Try again instead of loading forever.

- **A read-and-tick workbench keeps the article whole and docks the verdict.**
  A surface whose job is reading a public page and signing it off (Review)
  does not become a list plus pane: the article keeps its full width and its
  own contents rail, the queue is the picker behind the article name, and the
  decisions live in one review dock pinned to the bottom of the screen
  (`ReviewDock`, `src/features/dev/tools/review-mode/ReviewDock.tsx`,
  `role="region"` "Review"). The dock holds, top to bottom: a drawer that
  opens inside it (notes and flags, so writing never scrolls the reader away
  from the passage), the result of the last write with Undo and "Next
  waiting", the freeze line, then one row: the state pill, the sign-off
  credit, progress, the role or blocked-tick sentence, and the decisions
  (Hold, Notes and flags, the verdict) labelled at every width. The top bar
  keeps only where you are and how to move (leave, previous, picker, next,
  "N of M") and the tools.
- **A decision that cannot run says why in the dock.** The verdict is off
  while the body loads, when it failed, or when the article could not be
  drawn, and the dock's sentence names which; a drawing failure is reported
  up from the article's own error boundary (`DrawFailure`), so the key and the
  button refuse together.
- **Re-signing a changed record opens the changes first.** On an article that
  changed since its sign-off, the first R or press of Mark as reviewed opens
  the changes since review (scrolled in and focused, the dose, duration and
  interaction block first) and turns the verdict into "Confirm reviewed" with
  "Changes since the last review are shown above." in the dock; the next
  press signs off with the same request and revision as before. Opening the
  changes by hand counts. Moving to another article resets it; other
  articles sign off in one step; the diff still loads only when opened
  (`ReviewChangesSinceReview` `openSignal` / `onOpened`). An editor's
  "Recommend as reviewed" (or R) on a changed article takes the same gate
  (Pass 22): the first press opens the changes and writes nothing, the next
  opens the recommend confirm; a recommendation already waiting on this
  version is not gated.
- **Results carry what they finished.** A tick that completes a section or a
  class keeps its Undo; the completion becomes the result's title
  ("Stimulant, Common complete, all 3 reviewed."). A section names its class
  (`ReviewCelebration.groupLabel`).
- **A diff of prose marks its words.** `ArticleChangeDiff` marks removed and
  added words (`diffWords`, `ins`/`del` on the editor code-line tokens, with
  sr-only "added:" / "removed:"), so no reader compares two paragraphs by eye.
  Every consumer (Review, Change Review, Substances' review sheet) gets it.
- **Filters that change what the arrows walk show as chips.** When a queue
  filter is on, a group under the bar says "Queue filtered: N of M shown" with
  one removable `TagToken` per filter and Clear all; the settings dot also
  speaks.
- **A tool outside the /dev shell watches its own writes.** A route that
  renders editor tooling without the shell mounts `useWriteFreezeObserver` in
  its route client (never inside a component a test renders with a mocked
  `fetch`), and its surfaces read `useWriteFreeze()`.
- **The screenshot viewer covers `/review`.** Its layout and page read
  `getDevShellSession()`, the `/dev` gate (loopback, `next dev`, opt-in, write
  freeze); API routes keep their own checks.

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

### Pass 6: Banners (`/dev/banners`)

Commit: see `git log --grep "Dev tools redesign: Banners"`.
Screenshots: `tmp/redesign/banners/before/` and `tmp/redesign/banners/after/`
(loaded dark and light; locked editor and contributor; empty; presets failed;
display read failed; substance list failed; loading; open, scrolled, bottom,
light, off, sitewide; dirty; invalid; new; publish, discard, delete, enable,
disable, size and load-latest dialogs; search; staged; enabled with Undo;
saved; deleted; conflict; frozen; size dirty and saved; Coverage idle, deep
link, unknown slug, light; preset deep link; desktop and phone), captured by
`tmp/redesign/banners/capture.mjs`. Critique in
`tmp/redesign/banners/critique.md` (18/40 before), inventory with the
item-by-item check in `tmp/redesign/banners/inventory.md`, detector evidence in
`tmp/redesign/banners/detector/` (static scan of `source-before/`: clean).

Main changes:

- Presets is the editor workspace: presets as link rows (key, headline, tone,
  state pill "Live on 5 substances" / "Live everywhere" / "Renders nowhere" /
  "Off", "Hidden on N by the cap") left and sticky, the open preset in
  `PresetPane.tsx` right: header (key, tone, state, corner Close, Back to list
  below `lg`, focus on open, `useScrollToDetail`), the drawer's Preview /
  Words / Where it shows, Delete at the end with a keep-the-words hint, and a
  save dock (result notice, the one reason Publish is blocked from
  `publishBlocker`, Publish preset with the Cmd+S cap, Discard edits, state
  line). The table and its in-row drawer are gone.
- Every preset write result lands in context (see Conventions). A 409 is a
  conflict with "Load the latest version" (re-reads the one preset through
  `readWarningState`, destructive confirm); a failed write under the freeze
  reads as the freeze and keeps "Retry original change".
- Readout: one three-column strip that stays three columns on a phone, tone
  chips on `type-chip-label`, the sitewide tone as "All articles", and the
  summary names the two-banner stacking rule and how many articles hit it
  (`summarizeCapSuppression`); the Enable confirm says when the cap would hide
  the banner (`slugsHiddenByCap`). The substance corpus is read on arrival so
  the denominator is there from the start.
- The glyph size moved to an "Every banner" section under the list: secondary
  Save size behind a confirm naming old and new size, a glyph drawn at the
  saved size, an unsaved line, its own notice. Its read now goes through
  `useEditorReadState`, so a failure degrades only this section; the error
  boundary remains as a net and renders `LoadErrorState`.
- Where it shows: "Switches" (publish with the preset) and "Substances" (each
  change goes live on its own confirm) are labelled blocks; sitewide copy no
  longer says "renders nowhere" and the search hides while sitewide; results
  group into Name matches and "Class matches, read before enabling", rows
  toggle on tap, checkboxes are "Select <title>"; the enable row has no accent
  and shows only when something can be enabled.
- Coverage is a workspace too: searchable link-row list at every width (the
  phone select is gone; the list is a capped scroll well), "On N lists"
  pills, a detail panel (title, slug, count, classes, the deep-link line, the
  write notice, banners with Edit words and "Disable on <title>", cap warnings
  with their own Disable, "Not on this article" with Enable here), Rollout as
  link rows opening the preset. A `/dev/banners/<slug>` link scrolls its
  substance into view on phones once the list has loaded.
- Keys: Cmd+S (asks first) and `/` (focus the substance search), both in the
  `?` sheet through `useDevShortcuts`.
- Copy: sentence-case tones, titles in confirm buttons and notices, publish
  confirm titled with the preset and naming switch changes, loading as skeleton
  rows, `LoadErrorState` with `what` for presets, substance list and display.
- New modules: `PresetPane.tsx`, `bannerLabels.ts` (`TONE_LABEL`,
  `STATE_PILL_TONE`, `presetStateLabel`, `presetReachLabel`, `countNoun`);
  `presetDrafts.ts` gains `presetDraftIssues` and `publishBlocker` (the drawer
  and the dock share them).
- Shared, backward compatible: `EditorStatusPill` `inline`; `ConfirmRequest`
  `affectedLabel`; `ArticlePreviewFrame` `defaultWidth`.
- Journeys fixtures: `BANNER_TARGETS_SEED` (18 substances with free-form
  classes), `BANNER_PRESETS_SEED` (live listed danger and caution, sitewide
  caution, enabled-on-nothing, off; Diazepam carries three so the cap bites),
  the preset read by key with `operation` by change id, publish and delete with
  the route's revision check and conflict wording, pruning of unknown slugs,
  `/api/editor/banner-display`, the display POST, and molecule overrides
  answering null; with a unit test.

Deferred, with reasons:

- One save model for the whole pane (substance list changes as part of the
  draft): it would remove the immediate enable and disable with Undo, an
  existing capability; the two models are now labelled instead.
- Headline as the row and pane name instead of the key: the key is the stored
  identity the tool, the palette records and the dialogs name, and the
  earlier design settled on it; the headline sits under it on every row.
- The preview frame keeping article height when its article fails, and its
  36px theme and width toggles: shared `ArticlePreviewFrame` behaviour that
  Replication Studio uses too (the fixture has no article to serve).
- Delete as a restorable tombstone or requiring the preset to be off first:
  server behaviour; the pane and the confirm point at unticking Enabled.
- Default severity label from tone: would overwrite an editor's words; the
  field describes a mismatch instead.
- `EditorStatusPill` `inline` has no kit example yet; the story's exports are
  unchanged.


### Pass 7: Playlists (`/dev/playlists`)

Commit: see `git log --grep "Dev tools redesign: Playlists"`.
Screenshots: `tmp/redesign/playlists/before/` and `tmp/redesign/playlists/after/`
(admin loaded dark and light; editor, editor_translator, contributor and
translator; empty; failed; loading; open, light, as editor, long, unavailable
entry, bottom; dirty; search and no match; slug error; new as admin and as
contributor; save, discard, remove and owner dialogs; saved; saved with a
pruned entry; conflict; frozen; deep link; unknown deep link; open failed;
thumbnails failed; roster failed; row menu; read-only view; copy into new;
desktop and phone), captured by `tmp/redesign/playlists/capture.mjs`. Critique
in `tmp/redesign/playlists/critique.md` (18/40 before), inventory with the
item-by-item check in `tmp/redesign/playlists/inventory.md`, detector evidence
in `tmp/redesign/playlists/detector/` (clean before and after).

Main changes:

- P0 fixes: the shell said "Each save goes live right away" over a tool whose
  saves publish nothing (now `saveLine: "in-tool"` and "Saving publishes
  nothing." in the dock); a revision conflict offers "Load the latest
  version"; a freeze refusal reads as the freeze and keeps the draft; a deep
  link to a playlist never opened (the address sync replaced the key before
  the keyed read landed, which cancelled it).
- Layout: the editor workspace. Playlists are link rows (works, relative
  update time, owner name for an admin, "Read only" with a lock), the open
  playlist is `PlaylistPane.tsx` (header with key, update time and owner,
  corner Close, Back to list, focus and scroll on open) with a sticky save
  dock (notice, the one reason Save is blocked, Save or Create with the Cmd+S
  cap, Discard edits, state line, SaveLine). An unsaved new draft is its own
  row; New takes you back to it rather than sitting disabled.
- Works (`PlaylistWorks.tsx`): "Works, in order" heading with a count, drag by
  the handle, arrows and remove from `sm`, a row menu on phones with top and
  end moves, announcements and kept focus, missing entries flagged per row
  with "Remove them now", thumbnails Try again. "Add works": search with a
  glyph, `/` cap, Escape, "Searching", a count line, "Add all N", Try again,
  focus to the next result; the slug paste folds behind "Paste a slug
  instead".
- Owner: an in-pane block ("Changes on its own confirm, not with Save."),
  members by name everywhere ("(you)" for the viewer), a failed roster read
  says so with Try again. Remove moved into the pane.
- Read only: editors open other members' playlists in the pane without a dock
  and can "Copy into a new playlist".
- Key: a sentence under Name instead of a disabled field. A list filter with
  `/` appears past eight playlists.
- Shared, backward compatible: `SaveLine` `copy` and exported `SaveLineCopy`
  (kit story example added); `ReplicationThumb` `compact`; `useWorkCards`
  `retry`. `PlaylistEditor` is untouched and still serves the public viewer's
  contextual editor.
- Journeys fixtures: `PLAYLISTS_SEED` (five playlists: the viewer's own, one
  long enough to fold, one with an unpublished entry, another member's, an
  unowned one), `MEMBERS_SEED` (with a banned member), the collection, keyed,
  save (updated_at check, owner rule, pruning, conflicted and frozen),
  delete, owner and candidates routes, and `/api/dev/members`; with a unit
  test. People's roster read now answers from this seed.

Deferred, with reasons:

- Duplicate or restore after removal: no server history; the confirm says so.
- Showing an owner's address to editors on read-only rows: the route sends it,
  but the earlier design kept owner addresses admin-only; the pane says
  "Another member owns this playlist" instead.
- Moving `PlaylistEditor` (public viewer) onto `PlaylistWorks`: that surface is
  outside this pass.
- The phone bar's roll-up count on this tool: shell chrome.


### Pass 8: People (`/dev/people`)

Commit: see `git log --grep "Dev tools redesign: People"`.
Screenshots: `tmp/redesign/people/before/` and `tmp/redesign/people/after/`
(admin loaded dark and light; editor, editor_translator, translator and
contributor locked; empty; failed; loading; Needs a link and Everyone views;
search with no match; every kind of person: editor, translator, banned, self,
another admin, linked contributor, unlinked profile, profile whose email has
no account, second profile on one account; profile load failed; dirty;
permission, ban, link and unlink dialogs; banned, permissions saved, reset
link, reset dismiss guard, freeze refusal; linked; Roles; Invites, Active,
older page, form, created code, dismiss guard, freeze, failed, revoked;
"Invite them instead"; "What each role can do"; deep links by key and email;
desktop and phone), captured by `tmp/redesign/people/capture.mjs`. Critique in
`tmp/redesign/people/critique.md` (18/40 before), inventory with the
item-by-item check in `tmp/redesign/people/inventory.md`, detector evidence in
`tmp/redesign/people/detector/` (static scan clean).

Main changes:

- P0 fixes: "No role selected: Contributor access only." showed under a
  ticked Editor box (account and invite form); it now shows only when neither
  box is ticked, and the selected role's summary sits under the boxes. The
  one-time reset link rendered at the page top, off screen on phones; results
  now land in the open person's Account block under the buttons.
- Three views under the People heading (see Conventions): Members, Invites,
  Roles. The role guide and invite codes no longer sit under an open person;
  "What each role can do" in the permissions block opens Roles. Home's invite
  rows and "Open People" land on `/dev/people#invites`.
- Members is the triage workspace: a sticky list column (count, Refresh icon,
  `ViewChoices` with counts, search with `/` cap and Escape, the windowed
  `EditorList` listbox kept for arrow keys) and `PersonPane.tsx` docked right:
  initials, name, "(you)", sign-in and role, a link or flag pill, Banned, a
  corner Close, a pager (`j` / `k`, "N of M") and Back to list below `lg`.
  Rows are two lines at one pitch: name, role, and the flag with its glyph (or
  where the profile is), Banned, and an unsaved dot on the open row. A wide
  screen opens the first account that has something to manage; phones open
  nothing until a pick. The address follows the open person.
- The pane has two blocks that say when their changes land (Account: on the
  next request, after a confirm; Public profile: at once). Account facts are a
  grid (relative last sign-in, inviter by name, "Seed script"); Permissions
  shows the from/to line, Discard and the role summary; Sign-in holds Reset
  password and Ban (ghost destructive). The link row names the address in the
  body face; a second profile names the first and offers "Open <name>"; a
  profile whose address has no account offers "Invite them instead" (opens
  Invites with the note filled in).
- Invites: a "New invite code" panel (defaults to Contributor, a live sentence
  naming what it creates, "Create invite code", the reveal with the message
  first and a dismiss guard) beside "Issued codes" as open rows (status,
  role, note, languages, "N of M used", relative created, "by you" or a name,
  closes or revoked, redeemers who open their person), filter counts, a
  Refresh icon, and "N codes loaded" beside "Load older codes".
- Freeze: member writes, link changes, invite create and revoke read "Writes
  are paused, so that was not saved." (link: "the link did not change").
  Buttons stay enabled (the Inbox decision).
- Counts are omitted while unknown (no "0 accounts" on a failure); every load
  failure names what did not load.
- Confirms (follow-up commit "People: confirms for revoke, reset, unban,
  elevated invites"; "as strict as today" means never weaker): Revoke invite
  is a destructive `ConfirmDialog` naming the role, the note and the uses
  spent and saying it cannot be undone; Reset password asks plainly, naming
  the member and saying the current password keeps working until the link is
  used and any earlier link stops working (the server keeps one token per
  account); Unban asks, naming the member and the permissions they regain;
  Create invite code asks only above Contributor, naming exactly what the code
  creates (`describeInviteTerms` plus the note). Each has a test that Cancel
  writes nothing and Confirm sends the same request as before.
- Registry: `saveLine: "none"` for People (the pane's blocks say it).
- Shared, backward compatible: `RoleGuide` labels use `type-meta-label` (also
  on `/invite`); `MemberPermissionFields` sorts languages by name in a grid;
  `MemberAccountPanel` takes optional `onShowRoles` and `nameOf`;
  `useMemberActions` adds `noticesFor` (and keeps `notices`);
  `InviteCodesPanel` takes optional `nameOf`, `onActiveCountChange`,
  `prefillNote` and `onOpenMember`; `membersModel` adds `describePermissions`
  and `describePermissionChange`; `.theme-dev-avatar[data-kind="profile"]`.
- Journeys fixtures: `MEMBERS_SEED` covers every managed role (languages,
  never signed in, banned, another admin `FIXTURE_ADMIN_PEER`),
  `PROFILE_LINKS_SEED`, a non-empty `CONTRIBUTOR_PROFILES_SEED` (seven
  profiles, no avatars), `/api/dev/people`, the member writes (refusing admins
  and the viewer), invite paging (`INVITES_PAGE_SIZE`), create and revoke,
  full contributor profiles by key with the link write and its revision check;
  with a unit test. Tools that read the directory now see these profiles.

Deferred, with reasons:

- Profile editor internals (uppercase labels, a folded danger zone, its save
  bar and freeze wording): `ContributorProfileEditor` belongs to Contributors
  and renders there too; the Contributors pass.
- Cmd+S in the pane: two saves (permissions and profile), so one key cannot
  name one.
- A Banned view or filter: the three views fill the column; banned rows are
  marked in the list and the pane, and search finds them.
- Capping the invite history at five with Show all: paging already waits for
  the admin, and the loaded count sits beside it.
- Link rows instead of `EditorListRow` cards in the list: the windowed
  listbox (one tab stop, arrow keys) is the Inbox's; its rows are cards.

### Pass 9: Contributors (`/dev/contributors`)

Commit: see `git log --grep "Dev tools redesign: Contributors"`.
Screenshots: `tmp/redesign/contributors/before/` and
`tmp/redesign/contributors/after/` (admin dark and light; editor,
editor_translator, translator, contributor; empty directory; directory
loading; profile loading; profile failed; Just me; search and no match; a full
record (River), staff settings, orders, Mira; dirty; dirty guard; save
confirm; Cmd+S; saved; conflict and Load latest; frozen; avatar picked,
rejected, saved; partial link; bio over; alias added; order dirty, saved,
conflict, row menu; danger folded and open; merge ready; delete refused;
deleted; editor on another member's record; editor on their own; closed; deep
link and unknown deep link; People embedding; desktop and phone), captured by
`tmp/redesign/contributors/capture.mjs`. Critique in
`tmp/redesign/contributors/critique.md` (17/40 before), inventory with the
item-by-item check in `tmp/redesign/contributors/inventory.md`, detector
evidence in `tmp/redesign/contributors/detector/` (static scan clean before
and after).

Main changes:

- P0 fixes: a self record without arrays crashed the editor ("profile.aliases
  is not iterable"); `toContributorForm` and the loader now read missing
  arrays as empty. Editors below admin were shown editable forms, order saves
  and the danger zone on records the routes refuse; those records now open
  read only (see Conventions) and the danger zone says it is admin only.
- Layout: the editor workspace. Sticky list column ("Profiles", count,
  Scope, search with `/` cap and Escape, the windowed `EditorList` with
  `ContributorAvatar`, "(you)" and an unsaved mark per row, row skeletons,
  "Clear the search"), and `ProfilePane` (in `ContributorsTab.tsx`): avatar,
  name as the heading (sr-only "Editing"/"Viewing"), key, relative last save,
  "View public profile" accent link, read-only mark, corner Close, Back to
  list below `lg`, focus on open, idle pane on desktop, nothing open on phones
  until a pick. Deep links: `/dev/contributors/<key or alias>`
  (`contributorsInitialKey` in the page controller); the address follows a
  picked row with `replaceState(window.history.state, ...)`; an unknown key
  warns at the list and drops from the address.
- `ContributorProfileEditor` (also People's and the public artist page's):
  sentence-case `EditorField`s everywhere (no `Label`), a heading level prop
  (`headingLevel`, People passes `h5`), `showFacts`, `showSaveLine`,
  `saveShortcut`; sections Identity, Avatar, Bio, Links, Aliases, Staff
  settings (Visibility and provenance, Editor's note); the accent People link;
  a save dock (result notice with its way forward, the blocker, Save profile
  with the Cmd+S cap, Discard edits, state phrase, SaveLine) that bleeds to the
  pane edges; a save confirm naming the changed parts and each trust flag from
  and to (`changedProfileParts`, `trustFlagChanges`); conflict "Load the latest
  version" and freeze copy; a lost answer says Save resends the same change.
- Avatar: the public `ContributorAvatar` as the preview (circle, centre crop,
  said in the help; there is no crop tool), Upload or Replace, Clear, Remove
  now also for an uploaded picture, results beside it, the image address
  folded behind "Use an image address instead", a named file input out of the
  tab order.
- Links: a fieldset per link, problem line per row, https check, label capped
  at 60 (the server's cut), move up and down (new; the page lists links in
  order), focus and announcements on add, move and remove.
- `OrderingPanel` (shared with Replication Studio, backward compatible): open
  rows instead of cards, a handle that shows the position, arrows from `sm`,
  "More for <title>" menu (up, down, top, end), icon-only curate on phones,
  announcements and kept focus, `type-meta-label` divider, counts in words,
  "No changes yet" instead of "Order saved" at rest, no toolbar when there is
  nothing to order; new optional props `headingLevel`, `notice`,
  `onDismissNotice`, `saveNote`, `readOnly`, `autoCap` (Contributors folds the
  default order after five).
- `ContributorDangerZone`: folded (see Conventions), one danger surface with
  three operations, `EditorField`/`EditorCheckbox`, no placeholder answers,
  mismatch lines, a report-count warning before delete, pending labels, freeze
  wording, a merge opens the destination, retarget results stay in the zone,
  keyed per profile.
- Results land where the write was made: `useContributorsController` now keeps
  `profileNotice` (dock), `avatarNotice`, `orderNotices` (per panel),
  `dangerNotice` and `notice` (list: merge, delete, deep link). In contextual
  mode `notice` still carries profile and avatar results, so the artist page
  editor is unchanged. New controller API: `canWrite`, `closeProfile`,
  `loadLatest`, `selfKey`, `clearAvatarFile`, dismiss functions; options
  `viewerEmail`, `initialKey`, `startClosed`.
- Registry: `saveLine: "in-tool"` for Contributors; the shell test that
  guards the frame's instant line now uses Banners.
- Shared, backward compatible: `EditorSection` `headingLevel` accepts `h5`.
- Journeys fixtures: `CONTRIBUTOR_DETAIL_SEED` (River with aliases, links,
  nine works, three reports, a curated order with a retired slug; Mira with a
  note and flags; Halcyon archival), credited works and reports on the
  profile read, the ordering route (editor floor, ownership, revision check,
  pruning, conflicted), the danger route (admin floor, typed key, delete
  refused while credited, merge and delete remove from the directory), the
  ownership refusal on profile saves, staff note, avatar upload and removal;
  with a unit test.

Deferred, with reasons:

- Profile, Works and Reports as kept-mounted views: People embeds the same
  editor inside one block, where a view strip would nest views; folding the
  danger zone and the default order already halves the pane.
- Merge, retarget and delete as one "Fix an identity" flow in People: a
  product decision about where identity repair lives.
- Creating a profile for someone else: no route; a member's first save
  creates theirs.
- Palette records for profiles: wants the shared records convention; the deep
  link exists now.
- "Un-curate" wording: shared with Replication Studio and its tests.

### Pass 10: Copy (`/dev/copy-studio`)

Commit: see `git log --grep "Dev tools redesign: Copy"`.
Screenshots: `tmp/redesign/copy-studio/before/` and
`tmp/redesign/copy-studio/after/` (admin dark and light; editor,
editor_translator, translator and contributor; empty; catalogue failed;
catalogue loading; block loading; block failed; deep link and unknown deep
link; list, Effect Index, placeholder and no-default blocks; long markdown;
dirty and dirty at the bottom; publish, remove and discard dialogs; published;
conflict; frozen; default loaded into the draft; list item removed and moved;
placeholder dropped; removal unfolded; editor dirty, submitted and after a
reload; search by name, by words and with no match; Docs and Other sections;
Edited only; desktop and phone), captured by
`tmp/redesign/copy-studio/capture.mjs`. Critique in
`tmp/redesign/copy-studio/critique.md` (15/40 before), inventory with the
item-by-item check in `tmp/redesign/copy-studio/inventory.md`, detector
evidence in `tmp/redesign/copy-studio/detector/` (static scan clean).

Main changes:

- P0 fixes: a failed catalogue read dropped the whole editor to the route
  error page; it now reads through `useEditorReadState`, shows
  `LoadErrorState` in the list column, and the list stays usable from the
  checked-in defaults. A 503 freeze refusal was held as an unconfirmed
  publication (fields locked, Discard hidden, "retry the same publication");
  `useCopyIndexOperation` now treats the freeze as a definite refusal (the
  server's revision check still guards any retry) and the dock says "Writes
  are paused, so your changes were not published." A revision conflict had no
  way forward; it now says "Someone published this block after you opened
  it." with "Load the latest version" behind a destructive confirm
  (`replaceOnNext` lets the next keyed read replace the dirty draft).
- The frame said "Save draft stays private. Publish goes live." over a tool
  with no draft: the registry now sets `saveLine: "in-tool"` and the dock
  says "Publish goes live at once." (`COPY_PUBLISH_SAVE_COPY`) for admins and
  the proposal sentence for editors.
- Layout: the editor workspace. The list column (sticky from `lg`) holds the
  count ("453 blocks, 4 edited"), `SectionChoices` (six sections with counts,
  two rows of three), a Group `EditorSelect` with counts (the section prefix
  dropped: "Code", not "Docs · Code"), search with a glyph, `/` cap and
  Escape, a count line ("8 in Home", "12 matches in every section"), "Edited
  only" (every stored block across sections), and the windowed listbox with
  fixed-height rows (label, Effect Index / Edited / Pending pills, key, the
  place while searching, matches highlighted, "matched its default wording"
  for a stored block the catalogue lists without text). `CopyBlockPane.tsx`
  docks on the right: the label as the heading (sr-only "Editing"), key,
  section / group, "Stored <relative>" (and by whom for an admin), a source
  pill, the twin line with "Open the Effect Index wording" (or the dose.wiki
  one), an open proposal line, corner Close, Back to list below `lg`. Wide
  screens open the group's first block; phones open nothing until a pick; a
  deep link scrolls the pane in and focuses its heading once loaded; an
  unknown deep link warns at the list.
- Pane body: the field (grows with its words), placeholders the page fills in
  with warnings for dropped or new ones, Preview in a well (bulleted lists,
  "This block will be empty"), Changes (diff only when dirty), Default
  wording (show the default, Load default into draft with its reason when
  off, and Remove stored copy folded shut; a block with no default says it
  deletes for good). Save dock: result notice, the one blocker (unconfirmed
  publication, loading, failed, pending proposal), Publish copy / Submit for
  review with the Cmd+S cap, Discard edits (new), state phrase ("Unpublished
  changes" / "Changes to propose" / "Proposal pending" / "No changes yet"),
  SaveLine. The publish confirm is titled with the block and shows the diff.
- Keys: Cmd+S (Publish asks first; Submit goes straight out, as the button
  does) and `/`, both in the `?` sheet.
- `CopyBlockFields` (shared with the public contextual editor, same props plus
  optional `lengthGuide`): sentence descriptions, a numbered list with Move up
  / Move down (new), Remove as an icon on phones, focus follows add, move,
  remove and undo, an item count against 64, SEO text shows a character count
  against the search-result length.
- Palette: every checked-in block is a record ("Copy · Group · key"), loaded
  from the bundled defaults only when the palette opens (`devRecordSources`).
- Contextual editor (`CopyBlock.editor.tsx`) wording aligned: "Publish
  “<label>”?", "Publish copy", "Published “<label>”."
- Shared, backward compatible: `useCopyIndexOperation` throws
  `CopyIndexRefusal` (an `Error` with `status`, `code`, `conflict`, `frozen`)
  and clears the unconfirmed state on the freeze refusal (About and Index
  layout read it unchanged); `copyStudioUtils` gains `copyBlockBaseKey`,
  `copyBlockTwin`, `copySearchMatch`, `placeholderChanges`,
  `countSectionBlocks`, `describeCopySource`, `openCopyProposals`,
  `copyLengthGuide`, and preview stand-ins for `siteName`, `reviewer`,
  `discordInvite`.
- Journeys fixtures: `COPY_BLOCKS_SEED` (stored markdown, plain, list and a
  block with no default), `/api/editor/copy-blocks` (metadata only, as the
  real catalogue), `/api/dev/copy-block` GET by key with its revision, POST
  and DELETE with the admin floor, the `expected` / `expectedRevision` check,
  operation replay, `conflicted` and `frozen`; with a unit test.

Deferred, with reasons:

- "Edited" means a stored row exists, not that it differs from the default:
  the catalogue route returns metadata only, so the list cannot compare text.
- A page map ("Appears on") and a live link per block: no source names which
  pages read a key.
- Publishing text equal to the default deleting the row: server behaviour.
- The phantom blank removed line in the diff for an inserted paragraph:
  the shared `buildTextChangelog` builder.
- Palette records for stored blocks with no checked-in default: they come
  only from the catalogue read, which the palette does not make.
- The disabled accent button reading as enabled in light mode: the shared
  `Button` recipe.
- `EditorList`'s loop with rows of different heights is avoided here, not
  fixed in the shared list (recorded as a convention above).

### Pass 11: Writing (`/dev/writing`, the pinned About page included)

Commit: see `git log --grep "Dev tools redesign: Writing"`.
Screenshots: `tmp/redesign/writing/before/` and `tmp/redesign/writing/after/`
(admin landing dark and light; articles and blog lists; article and blog rows,
full, bottom, light; new article and new post; dirty, dirty guard, discard
confirm; publish confirm; saved; conflict and the merge after it; frozen;
preview hidden and preview only; invalid and taken address; blocked cover;
recovery offer after a reload; unknown deep link; list and row failed; empty;
list and row loading; editor row, dirty, submitted; editor_translator;
translator and contributor locked; About loaded dark and light, full, bottom,
dirty, publish confirm, saved, conflict, load latest, frozen, discard, live
counts, founders, founder added, credits, editor, editor submitted, failed,
empty, loading, guard; desktop and phone), captured by
`tmp/redesign/writing/capture.mjs`. Critique in
`tmp/redesign/writing/critique.md` (18/40 before), inventory with the
item-by-item check in `tmp/redesign/writing/inventory.md`, detector evidence in
`tmp/redesign/writing/detector/` (one false positive before).

Main changes:

- P0 fixes: save, conflict and freeze results rendered at the top of a long
  form (About showed only "Save failed"); they now land in a save dock. A failed
  row read showed a blank editable form under "Load failed"; it is now
  `LoadErrorState` in the pane with no form and no dock. A 503 freeze refusal
  was held as an unconfirmed publication (fields locked, "Retry publication
  confirmation"); `useWritingWorkbenchController` now treats it as a definite
  refusal (the About side already had it from Copy's `CopyIndexRefusal`). The
  preview rendered a second `<main id="main-content">` and clipped its headings
  in a 420px column; it now uses the embedded page components.
- Layout: the editor workspace, `layout: "full-bleed"` with the tool capped at
  `max-w-[100rem]`. The list column (sticky from `lg`) holds "Pinned" (About
  page), the Kind control (Articles / Blog posts with counts, omitted while
  unknown), New article / New post, a filter with `/` past eight pages, and
  link rows grouped Drafts then Live (title, address, written date, "Editing",
  unsaved dot). `WritingPane.tsx` docks on the right: saved title (sr-only
  "Editing"), kind and state pill, View live and the address, date and "Saved
  at", Back to list below `lg`; the View switch; `WritingFields.tsx` in three
  groups (Words, Publishing, Byline and tags); the preview; a Versions section
  (Load the latest saved version, recent changes as disclosure rows); the dock.
- Dock: result notice (conflict keeps the route's words and offers Load the
  latest saved version, which merges and so needs no destructive confirm;
  freeze copy), the one blocker (`writingSaveBlocker`, a refused rename, an open
  recovery choice, or the unconfirmed publication with its Retry), the outcome
  button with the Cmd+S cap, Discard edits (destructive confirm), the state
  phrase (including "Unsaved changes kept in this browser at ..."), and
  `SaveLine` (`WRITING_ADMIN_SAVE_COPY` for admins, the proposal line for
  editors). The admin review moved into the confirm (`WritingChangesReview`:
  Was / Now per field, the body as a diff).
- About (`AboutEditorTab.tsx`, now the About pane): header with View live and
  "Last published" (who, for admins), the View switch, Page text (Markdown
  source, Copy Markdown, Reset text while changed, live counts folded and
  inserting at the caret with today's values), Subtitle and search description
  (raw and filled-in counts, warning past 160), preview (now with the subtitle),
  Founders and Translation credits as `AboutPaneSection`s with
  `ContributorAvatar` rows, "More About wording, in Copy" as link rows, Changes,
  and a dock (Publish About page / Submit for review, a confirm naming the
  changed parts with their diffs, Discard edits, conflict with "Load the latest
  version" behind a destructive confirm, freeze copy, unconfirmed alert).
- Keys: Cmd+S in both panes (asks first; Submit goes straight out), `/` for
  the list filter, `j / k` to walk the rows; all in the `?` sheet.
- Controller API (frontend): `saveFailure`, `dismissNotice`, `listLoading`,
  `retryList`, `rowError`, `retryRow`, `missingSlug`, `dismissMissing`; About
  gains `saveFailure`, `dismissNotice`, `discard`, `loadLatest`,
  `loadingLatest`, `lastWrite`. Model: `WRITING_FIELD_LABELS` (Slug is
  "Address"), `writingAddress`, `writingKindNoun`, `changedWritingFields`,
  `describeWritingChanges`, `joinWords`, `writingSaveAction`,
  `writingSaveBlocker`, `groupWritingEntries`, `writingEntryMatches`,
  `formatPublicationDate`.
- Registry: `saveLine: "in-tool"`, `layout: "full-bleed"`.
- Shared, backward compatible: `EffectIndexArticlePage` and
  `WritingBlogPostPage` take `embedded`; the contextual `WritingEditor` renders
  `WritingFields` (its review, discard and status flow unchanged, preview
  embedded); "…" dropped from the contextual Writing and About strings.
- Journeys fixtures: `WRITING_SEED` gains a dated article with a byline, a
  draft article and a blog post with a cover; the list carries date, teaser and
  tags as the route does; `ABOUT_SEED` and `/api/dev/about` (GET with
  aggregates, POST with the admin floor, operation replay, revision and content
  check, `conflicted` and `frozen`), with a unit test. Journeys now press the
  outcome button and confirm in a dialog, check `aria-current`, and expect the
  freeze copy.

Deferred, with reasons:

- Undo after publishing: no server history.
- The accent first word and uppercase role chips inside the About preview:
  they are the public renderer and `ContributorCard`, drawn as readers see them.
- `AboutCopyEditors` still carries its non-contextual mode, now unused in the
  tool; the contextual About panel owns it and its layout was out of scope.
- A Close in the pane: see the convention above.

### Pass 12: Tags (`/dev/tag-editor`)

Commit: see `git log --grep "Dev tools redesign: Tags"`.
Screenshots: `tmp/redesign/tags/before/` and `tmp/redesign/tags/after/`
(admin loaded dark and light, full page; editor, editor_translator, translator
and contributor; empty; failed; loading; library loading; field switch;
search and no match; picked; rename typed, empty and unchanged; renamed, full
and bottom; merge typed and merged; move filled, moved, copied; remove confirm
and removed; undone; commit confirm; committed; commit under the freeze;
editor submitted; server check blocking; copy diff; reload failed; rewrite
failed; recovery offer and held edits after a conflict; desktop and phone),
captured by `tmp/redesign/tags/capture.mjs`. Critique in
`tmp/redesign/tags/critique.md` (16/40 before), inventory with the
item-by-item check in `tmp/redesign/tags/inventory.md`, detector evidence in
`tmp/redesign/tags/detector/` (static scan clean; the in-page detector is
blocked by the page CSP).

Main changes:

- P0 fixes: a move added the destination label to every article in the corpus
  (`applyMove` in `src/utils/data/tagRegistry.mutations.ts` never checked that
  the article carried the tag; moving a 2-article tag reported "in 22
  articles"); now only carriers move, with a test. A rename onto an existing
  label merged two tags without a word; it is now named before it runs. A
  removal's result and Undo rendered inside the next tag's danger zone; the
  pane now stays on the removed tag. The commit confirm said only "Tags, 2
  articles"; it now lists the tag changes.
- Layout: a Working changes panel first (see Conventions), then the Tags
  section as an editor workspace. List column (sticky from `lg`): "By field"
  heading, "56 in use" and a Reload icon button (failure inline with Try
  again), the four fields as a two-by-two choice with counts, search with the
  `/` cap and Escape, a count line, the windowed listbox with fixed 44px rows
  (label with matches marked, "Changed" with the unsaved dot for tags the
  working changes moved, article count), "Found in" other fields and "Clear
  the search" when nothing matches, a key hint. `TagPane.tsx` on the right:
  field as a meta label, the tag as the heading (sr-only "Tag: "), "On N
  articles", a changed pill, the search-hidden line, Back to list below `lg`
  (no Close: a tag is always open); Articles as link rows to the public page
  (new tab), capped at five with Show all; "Looks like the same tag" with
  one-tap "Merge into “X”"; "Change it everywhere" with the Rename or merge /
  Move / Remove views; and a sticky dock (the result with Undo, a pending line,
  what waits, Review and commit).
- Rename: no-op labels are off with the reason; a case-only change, a rename
  and a merge each say what happens; the button becomes "Merge into “X”".
  Move: a native `EditorSelect` of the other fields, "Label there (optional)",
  "Keep it in <field> too", a sentence naming the outcome and any collision,
  "Move to <field> in N articles" / "Copy to ...". Remove: a destructive
  confirm listing the articles (the machine's confirmation flag is set by the
  confirm, so its guard still holds). Pending buttons say "Renaming",
  "Merging", "Moving", "Copying", "Removing".
- Working changes: tag changes read as renamed, merged in, new, removed or on
  a different count (`tagChanges`, `describeTagChange`), capped at five; the
  full diff folds shut with Copy diff and Download .diff; a proposal receipt
  with "Open in Change Review" stays until dismissed; a failed commit under the
  freeze reads "Writes are paused, so your changes were not committed. They
  stay in your working changes."; a server that cannot write says why under
  the button.
- Keys: `/` (search) and Cmd+S (commit; an admin's commit still asks first, an
  editor's proposal goes straight out as the button does), both in the `?`
  sheet.
- Loading is a workspace skeleton; a failed read is `LoadErrorState` with
  `what="tags"`; an empty corpus points to Substances.
- Copy: "Tags" (not "Tag Editor"), sentence-case field labels
  (`TAG_FIELD_LABELS`), no eyebrow, no uppercase labels, no section stagger.
- New modules: `TagListColumn.tsx`, `TagPane.tsx` (with `TagDock`),
  `WorkingChangesPanel.tsx` (with `TagChangeLead`), `TagFeedback.tsx`,
  `tagEditorModel.ts` (`checkRename`, `existingTagFor`, `similarTags`,
  `unionArticleCount`, `tagChanges`, `describeTagChange`,
  `matchesInOtherFields`) with tests. `TagListPanel`, `TagDetailPanel` and
  `TagMutationForms` are gone. The state machine is unchanged; its integration
  tests gained merge wording and the remove confirm (cancel removes nothing).
- Shared, backward compatible: `useDevModeSaveActions` returns
  `commitControls` (and `requestCommit` takes an optional `lead`);
  `CommitScopeSheet` `lead`; the commit confirm's description and single-unit
  button; `EditorServerHealthIndicator` says "Check again" in sentence case
  (was an uppercase chip "Retry"); `StagedArticlesRecoveryNotice` held rows
  name the article title and fields in words; `TAG_FIELD_LABELS` in sentence
  case.
- Journeys fixtures: `TAG_ARTICLES_SEED` (22 substances with near-duplicate
  labels) behind `/api/dev/editor-library` (list, `scope=tag-registry`,
  `slug=`), `INDEX_LAYOUTS_SEED` for `/api/dev/index-layout?type=all` (the
  library could not build without it, so every corpus tool now has a corpus),
  `/api/editor-config-health`, and `POST /api/save-article` (admin floor,
  freeze, tag fields land in the store); under `conflicted` an article changes
  after its first whole read, so a restore holds edits aside. With a unit test.

Deferred, with reasons:

- Multi-level undo (every operation revertible until commit) and multi-select
  merge: both change the state machine's transitions or add a mutation type.
- Rewording the commit success ("Committed 2 article(s) to production as ..."):
  the shared save orchestrator builds it and its tests guard it.
- Hiding the frame's write line while Tags loads its own registry: the shell's
  readiness knows only the library.
- `DevCommitCard` still carries the "Live site" eyebrow and repeats the
  frame's sentence; Index layout renders it, so that pass should move to
  `commitControls` too.
- Success notices quote tags with straight quotes: they are the state
  machine's record strings, which its tests assert.

### Pass 13: Feedback (`/dev/article-feedback`, `/dev/feedback`, `/dev/site-feedback`)

Commit: see `git log --grep "Dev tools redesign: Feedback"`.
Screenshots: `tmp/redesign/feedback/before/` and `tmp/redesign/feedback/after/`
(admin article and site, dark and light; every status filter; importance
order; search, contact search, no match, filtered empty with "Found under";
every kind of item: new with contact, mine with a pending correction,
claimed by another admin, resolved with a published correction, rejected with
an outcome, spam with the spam trap, a pre-log note, site items; reject, spam,
No change needed, bulk and discard-note dialogs; Close as menu; note typed;
claimed; resolved with Undo; undone; bulk; link picker; linked; frozen
decision; deep link outside the filter; missing deep link; empty; failed;
loading; stale rail count; editor, contributor and translator locked; desktop
and phone; the Inbox embedding in `after/inbox/`), captured by
`tmp/redesign/feedback/capture.mjs`. Critique in
`tmp/redesign/feedback/critique.md` (15/40 before), inventory with the
item-by-item check in `tmp/redesign/feedback/inventory.md`, detector evidence
in `tmp/redesign/feedback/detector/` (static scan clean).

Main changes:

- P0 fixes: a critical safety report sat under older nits (waiting work now
  opens By importance when the source asks readers for one); nobody could see
  who held a Reviewing item (hold line from the decision log); the result,
  Undo and decisions sat far below long content (decision dock); on phones the
  review was two screens below the list and tapping the automatic first row did
  nothing (master/detail with Back to list and a pager; tapping it counts as a
  pick).
- Layout: the triage workspace. Tool heading "Feedback" with the source choice
  (Article / Site with rail counts) and one sentence per source; the list
  column (`FeedbackQueueColumn.tsx`, sticky from `lg`): "Queue" meta heading,
  count line, Refresh, `FeedbackStatusChoices` (seven statuses, four columns,
  counts), search with glyph, `/` cap and Escape, the Sort `EditorSelect`, the
  contact hint, the bulk toolbar, the windowed list (rows: title, importance
  when not normal, status only when the filter spans statuses, category, age,
  holder, words), paging, the load failure in place, and a key hint.
  `FeedbackReviewPane.tsx` docks on the right: title, category, "Waiting
  since" / "Received", importance and status pills, Copy link, pager, the
  "hidden by the list" line for a linked item another filter hides, facts,
  "What they wrote", Correction, the decision log, the note, and the dock
  (notice with Undo, freeze line, hold line with Claim / Release / Reopen,
  Resolve / Reject / Mark as spam with key caps, the "Close as" outcome menu).
  Decided items hide the decisions and offer Reopen.
- Copy: "Mark as spam" (was "Spam"), "Claim" (was the "Reviewing" button),
  sentence-case source titles, "Reader rated it" in the reader's words, the No
  change needed confirm says it closes as No change needed, spam confirms are
  destructive, bulk confirms say "N items"; a freeze refusal reads "Writes are
  paused, so that was not saved."
- Correction panel: native `EditorSelect` for the section (labelled), Start
  correction with its new-tab glyph, "Link existing change" as a reveal with
  `ExpandIndicator` opening a radio list of proposals and revisions with
  summaries (Link, Cancel), linked rows in one bordered list with relative
  dates; folded on spam.
- Inbox embedding: the adapters' `renderDetail` now returns facts only
  (`FeedbackFacts`), so every feedback source sets `detailHasHeading: false`
  and the Inbox pane draws the title and pills.
- New modules: `FeedbackFacts.tsx` (`FeedbackFacts`, `readerScale`,
  `formatReceived`, `readableAddress`), `FeedbackQueueColumn.tsx`,
  `FeedbackReviewPane.tsx`, `feedbackReviewModel.ts` (`holdOf`,
  `describeEmptyQueue`, `describeFilterCount`, `isFreezeRefusal`, status and
  importance words and tones) with tests. `FeedbackReviewQueue` gains
  `heading` and `actorEmail` (the tab passes the shell's `userEmail`);
  `FeedbackMetadataItem` is gone; adapters gain `labels.noun`.
- Registry: `saveLine: "none"` for Feedback.
- Shared, backward compatible: `TriageShortcutHint` draws `?` with
  `theme-dev-kbd`. Glossary's reader feedback mounts the same queue and gets
  the workspace unchanged in behaviour.
- Journeys fixtures: the feedback seed grows to eight article and five site
  items (every status, contact, spam trap, outcome, pre-log note, another
  admin's claim), `feedbackQueuePage` answers `status` (with `unresolved`),
  `q` (never contact columns), `order`, `cursor`, `limit`; one item by id;
  corrections with linked changes and candidates; the link POST; outcomes on
  status writes; with a unit test. The Inbox and Home now list four more
  waiting feedback items.

Deferred, with reasons:

- Keeping the pane on the decided item: the queue's tested rhythm hands the
  review to the next row; the notice names the decided item and keeps Undo.
- Bulk Resolve: a new bulk capability for a decision that carries a note and
  an outcome.
- Friendly names in `DecisionLogSection` and the hold line for external
  emails: no directory (as the Inbox pass).
- Importance order treating spam as low: the server's order.
- Take over for feedback claims: the Inbox offers it only for claim-table
  sources.

### Pass 14: Change Review (`/dev/queue`)

Commit: see `git log --grep "Dev tools redesign: Change Review"`.
Screenshots: `tmp/redesign/change-review/before/` and
`tmp/redesign/change-review/after/` (admin loaded dark and light; every status
selected: waiting with an article patch and discussion, drifted, own, copy
block, unavailable comparison, returned, published, rejected, superseded,
reverted, claimed by another admin; approve, drifted approve, reject and
revert dialogs; rejection note typed; approved, returned, rejected, reverted;
comment typed and posted; claimed; frozen and conflicted approve; My pending;
search and no match; recommendations, ticked, confirm, approved, stale,
frozen, task link and missing link; deep link, deep link in My pending,
missing deep link; empty; failed; loading; detail failed; stale rail count;
editor loaded, returned, waiting, rejected, empty; editor_translator;
contributor and translator locked; desktop and phone), captured by
`tmp/redesign/change-review/capture.mjs`. Critique in
`tmp/redesign/change-review/critique.md` (20/40 before), inventory with the
item-by-item check in `tmp/redesign/change-review/inventory.md`, detector
evidence in `tmp/redesign/change-review/detector/` (static scan clean before
and after).

Main changes:

- P0 fixes: Approve was enabled on a proposal with no verifiable comparison
  while the copy said to prepare a new one first; it is now off with the
  reason (the server rule is unchanged, the tool is stricter). On phones the
  review sat below the recommendations lane and every row, and picking a row
  showed nothing; it is now master/detail with Back to list and a pager.
- Layout: the triage workspace. Admins get two kept-mounted views,
  Proposals and Recommendations (`EditorNavTabs` with counts, `#recommendations`,
  a `?recommendation=` link opens it). `ProposalListColumn.tsx`: "Proposals"
  meta heading, count line, Refresh, All / My pending, search with the `/` cap,
  groups (Awaiting review, Needs revision, then History: Published, Closed
  capped at five) of link-row buttons (summary with matches marked, proposer
  or "You", relative age, targets in words, comment count, holder; status
  pills only in the mixed Closed group), skeletons, empty, "All clear",
  filtered-empty with Show everything and Clear the search, key hint.
  `ProposalPane.tsx`: summary as the heading, "By X" or "Your proposal",
  "Waiting since", status pill, Copy link, pager (j/k), Back to list below
  `lg`, the hidden-by-list line; body: next step, review feedback, facts,
  Content affected, What changed, other editors, "Revise it yourself" (admin
  Load into editor), Discussion, Rejection note; dock: result with "Next
  waiting", pending line, freeze line, hold line (Claim / Release), Approve
  and apply (accent, `a`), Reject (outline, `r`), Revert, the proposer's Load
  into editor (accent), and each reason.
- Recommendations: a panel with Refresh, what approving does, "Ready to
  approve" and "Changed since recommended" groups, display names, relative
  times, notes as quotes, "Open in Review" on ready rows, a sticky dock (result,
  freeze line, Approve selected, Select all ready, "2 of 3 selected"); the
  confirm lists each title with its recommender and note.
- Confirm wording kept (test-guarded); the approve confirm now leads with the
  summary and proposer and heads its list "Publishes N items".
- Freeze: a refused write (503 with `DATA_WRITES_FROZEN`, now carried on
  `QueueRequestError.frozen`) reads "Writes are paused, so that was not
  saved."; buttons stay enabled.
- Keys: `j / k`, `a` (approve, asks first), `r` (reject, asks first, or
  focuses the empty note), `n` (the note, or the comment for editors), `/`,
  Cmd/Ctrl+Enter posts a comment; all in the `?` sheet.
- Model and requests: `TARGET_KIND_LABELS` (one copy), `describeTargets`,
  `isOpenProposal`, `describeQueueCount`, `proposalMatches`, `nextStepFor`,
  `approveBlocker`, `describeDrift`, `proposalHoldOf`, `QUEUE_HISTORY_CAP`;
  `fetchProposalClaims`, `writeProposalClaim`, `isWriteFreezeError`,
  `QUEUE_FREEZE_COPY`. `QueueTab` takes `actorEmail` (the shell passes
  `userEmail`).
- Shared, backward compatible: `ProposalReview` is now composed from exported
  parts; the article page's `ArticleProposalReview` keeps its props and inline
  decisions (facts now use meta labels and relative times, the feedback
  reference is a link).
- Journeys fixtures: `seedChangeReview` (ten proposals over every status, an
  article patch with discussion, a moved target, the viewer's own, a returned
  one, copy and About targets, an unavailable comparison), `seedRecommendations`
  (three ready, one stale), the approve (admin floor, self-approval refusal,
  compare-and-swap, `conflicted`), reject (note required), revert and comment
  routes, `?status=` on the list, and the recommendations GET and POST
  (revision check, stale, missing); with a unit test. An editor sees only
  their own proposals. The Inbox and Home now list more proposals and
  recommendations. `run-journeys.mjs` waits on the pane heading and the new
  failure title.

Deferred, with reasons:

- A direct "Request changes" (return without approving): no route; a return
  happens only when approve finds the live content moved.
- Take over another admin's claim here: the Inbox owns take over and its
  confirm; this tool shows the holder and never blocks on it.
- Renaming "Apply to production" and "Approve and apply" to one verb: the
  labels are test-guarded and used by the journeys; the dock and confirm now
  say what happens instead.
- The heading order inside `ArticleChangeDiff` (its h3 under the pane's h4):
  shared and test-guarded; the article page renders it too.
- Display titles instead of slugs for targets and a field list in the approve
  confirm: the proposal summary rows carry keys only.
- A reviewer attestation recorded with an approval: needs a server field.


### Pass 15: Trip reports (`/dev/trip-report-submissions`, alias `/dev/trip-reports`)

Commit: see `git log --grep "Dev tools redesign: Trip reports"`.
Screenshots: `tmp/redesign/trip-reports/before/` and
`tmp/redesign/trip-reports/after/` (admin loaded dark and light; alias; the
three views; grouped; a facet; filters open; search and no match; every kind of
submission: new, claimed by another admin, mine, accepted, accepted with the
byline guard, rejected before the log, spam from the spam trap, published;
reject, spam, publish, bulk, save, discard and keys dialogs; note typed;
claimed; accepted with Undo and Next waiting; preview; published with the
member offer; the byline refusal; bulk; published report open, light, timeline,
bottom, flat body, dirty, saved, conflict, frozen, byline claim, delete
unfolded; frozen decision; deep link and missing deep link; empty; failed;
corpus failed; loading; open failed; editor, editor_translator, contributor and
translator locked; desktop and phone), captured by
`tmp/redesign/trip-reports/capture.mjs`. Critique in
`tmp/redesign/trip-reports/critique.md` (16/40 before), inventory with the
item-by-item check in `tmp/redesign/trip-reports/inventory.md`, detector
evidence in `tmp/redesign/trip-reports/detector/` (static scan clean).

Main changes:

- P0 fixes: every result, refusal and conflict rendered at the top of the pane,
  off screen from the button; they now land in a decision dock (submissions)
  or a save dock (reports). After a publish the stale preview still said
  "Nothing is public yet"; a preview no longer replaces the submission and a
  published one says Published with View live and "Open the published report".
  Publish was offered on a submission whose author gave no consent; it is now
  off with the reason (stricter than the route). On phones about thirty facet
  controls sat above the list and the decisions after the whole report; the
  tool is master/detail now.
- Layout: the triage workspace, `max-w-[100rem]`. `EditorSection` "Trip
  reports" with one sentence of totals. `PortalListColumn.tsx`: "Reports" meta
  heading, count line, Refresh, three views (Needs review, Published, All; label
  over count, ", not loaded" while a source is unknown), search with glyph, `/`
  cap and Escape, "Filters" (Order, Group by, Substances, Authors and Tags as
  `SearchableMultiPicker`s counted within the view), active filter chips with
  Clear all, the list notice, the bulk bar, one `LoadErrorState` per failed read
  (one for both), skeleton rows, empty states (All clear with Show everything,
  "Found under Published (2)" with "Clear the search and filters", an empty
  corpus pointing to the public submission form), the windowed list with fixed
  64px rows (title, status when the view spans statuses, byline, first substance
  and dose, "Waiting since" or the trip date, "Submission ·" on a submission
  that became a report, the unsaved dot), and the key hint.
- Order: Needs review opens "Waiting longest" (received date, new sort
  `waiting`); Published and All open newest trip first; a picked order holds
  across views. Rows carry `receivedAt`.
- Submission pane (`PortalSubmissionReview.tsx`, rewritten): Back to list and
  the icon pager below `lg`, corner Close, title, byline and substances,
  "Waiting since", status; the hidden-by-list line with "Show it in the list";
  consent and contact facts (`FeedbackFacts`, consent and age as warnings, the
  spam trap); "What they wrote" (the trip's details, substances, the phases in
  their colours, received date); the decision log; Publishing (contributor
  picker, the keep-unattributed box shown when the byline matches or the route
  refused, Preview publish, the preview); Published (View live, Open the
  published report); the private Decision note (grows, `n`). Dock: the result
  (Undo with `u`, "Next waiting: <title>", "Assign to this member", "Go to
  Publishing" after a byline refusal), the freeze line, the hold line
  (`submissionHoldOf`: Claim, Release, "Claimed by X", "Accepted by you, 2 days
  ago. It waits for Publish." and Reopen, "Rejected by X. Reopen it to decide
  again."), then Accept (accent, `a`), Reject (`r`), Mark as spam (`s`) on New
  and Reviewing, or Publish (accent, builds the preview then confirms with it)
  and Reject on Accepted. The reject confirm keeps the public reason field,
  echoes the private note, and says an author without a reason sees only
  "Rejected". The note clears once a decision records it.
- Report pane (`PortalReportPane.tsx`, new; the editor workspace): saved title
  (sr-only "Editing"), Published, View live and the address, attribution and
  licence in words, corner Close, Back to list and pager below `lg`; Title;
  "Byline and attribution" (byline with contributor suggestions, the contributor
  profile as a `SearchablePicker` by name with Clear selection, a live line with
  "Attribute to <name>" when the new byline is a contributor's name, the
  keep-unattributed box); "The trip"; Tags; Substances; Report body; "Delete this
  report" folded shut and keyed on the report (typed address, no placeholder,
  "That does not match", names unsaved edits). Dock: result (conflict with Load
  the latest version behind a destructive confirm; freeze copy; the byline
  refusal with its two ways out), Save with the Cmd+S cap (asks first, naming the
  changed parts including attribution), Discard edits, state phrase, `SaveLine`.
  A deletion lands as a notice at the list. The discard dialog names the report.
- Keys: `j / k`, `a`, `r`, `s`, `n`, `u`, `/`, Esc and Cmd+S, all in the `?`
  sheet. Picking from the listbox keeps focus there; the pager, j/k and links
  move it to the pane heading.
- The address follows the open record (`/dev/trip-report-submissions/<id>`,
  `replaceState(window.history.state, ...)`); a deep link opens published
  reports too, switching the view, and one that names nothing says so at the
  list.
- Registry: `saveLine: "in-tool"`. The shell passes `actorEmail`.
- Timeline editor (shared with My reports and the public correction panel):
  one "Add entry" under each phase (the empty phase has its own "Add an onset
  entry"), "Conclusion" instead of "Conclusion / Aftermath" (the public page's
  heading is unchanged), text boxes that grow with their words, icon Remove,
  32px arrow buttons with touch halos, entries as an `ol`. Labels of every
  control a test reads are unchanged ("Onset entry 1 timestamp", "Move Onset
  entry 2 earlier", "Remove Onset entry 1").
- Shared, backward compatible: `ReportTagsField.tsx` (My reports' tags field,
  moved out of `OwnedReportPane`); `ReportFields.tsx` (`TripDetailsFields`,
  `SubstancesField` with a fieldset per substance and focus on add and remove);
  `PortalReportEditor` is now only the public correction panel's form (same
  props; "Report title", "Review"; unused props kept optional) and draws the
  shared field groups; `submissionReviewModel.ts` (`submissionHoldOf`,
  `classifyRefusal`, `changedReportParts`, `attributionMoved`, freeze copy);
  `tripReportPortalModel` gains `receivedAt`, the `waiting` sort, label maps,
  `defaultSortFor`, `bucketMatchCounts`, `describePortalEmpty`.
  `PortalOrganizerRail.tsx` and the unused `theme-portal-row`, `-bucket`,
  `-needs-dot` and `-count-badge` rules are gone.
- Journeys fixtures: trip submissions in every status with full bodies
  (`seedTripSubmissions`: new with contact, claimed by another admin, mine,
  accepted with a member's email, accepted with a contributor's byline, rejected
  before the log, spam trap, published), `PORTAL_REPORTS_SEED` (three more
  published reports, one attributed, one flat), `/api/dev/trip-reports`, the
  queue's `scope=portal`, `scope=needs-review` and `id=`, the promote route
  (accepted only, the byline guard, preview, publish, suggested owner), the
  admin's record save (every field, attribution, the byline guard, revision
  check) and delete; with a unit test. The Inbox and Home now list three more
  waiting trip reports.

Deferred, with reasons:

- Holder names on list rows ("Claimed by X"): the portal index
  (`listPortalSummaries`) carries no reviewer or decision log; the pane's hold
  line has it. Needs a server field.
- Row checkboxes without a touch halo and the doubled focus outline on the open
  row: shared `EditorList`.
- Delete as unpublish with a log, or undo after delete or publish: server
  history and a product decision.
- "Accept and publish" in one step: Accept is a status the Inbox and the
  transition table rely on; Publish now carries its own preview.
- Splitting Submissions and Published reports into two views: the one-corpus
  list is the tool's founding decision (see the model's header); the panes now
  differ clearly instead.
- Sending the public reason from the pane instead of the reject dialog: it
  belongs to one decision, and the dialog now echoes the private note.

### Pass 16: Citations (`/dev/citation-review`, alias `/dev/citations`)

Commit: see `git log --grep "Dev tools redesign: Citations"`.
Screenshots: `tmp/redesign/citations/before/` and `tmp/redesign/citations/after/`
(admin loaded dark and light, full page; alias; every row kind open: ready with
two sources, needs review with diagnostics and a legacy snippet, rejected with
its note, needs source; reject form and Other; rejected; approved; undone; `a`
with nothing open; `r`; section locked, confirm and approved; set confirm,
approved and locked at the bottom; MDMA, Ketamine, Caffeine; Accepted,
Rejected, All; search and no match; claimed; frozen decision; conflicted
decision; deep link and missing deep link; empty; failed; loading; rows
loading; rows failed; refresh failed with the list kept; stale rail count;
editor and contributor locked; desktop and phone), captured by
`tmp/redesign/citations/capture.mjs`. Critique in
`tmp/redesign/citations/critique.md` (18/40 before), inventory with the
item-by-item check in `tmp/redesign/citations/inventory.md`, detector evidence
in `tmp/redesign/citations/detector/` (static scan clean).

Main changes:

- P0 fixes: on phones evidence rows were unreadable (pills squeezed the claim
  to a few letters and the quote to a word per line); rows now stack the
  status under a claim that never truncates. The status route writes without a
  revision check, so a row another admin had just decided was decided blind;
  every decision and undo now reads the rows first and refuses with the latest
  on screen (see Conventions). Approving a rejected row or one the checks
  flagged with an error now asks first (quoting the reason or the error), and a
  row needs a support with a verified quote to be approvable
  (`canApproveCitationEvidence`). The tool loaded no corpus, so titles showed
  as slugs and the checklist's marker check and the token preview never
  appeared unless another tool had loaded the library; the registry now says
  `library-deferred` and the route honours it.
- Layout: the triage workspace. `CitationQueuePanel` is the list column
  (sticky from `lg` at `top-24`): "Articles" meta heading, count line, Refresh,
  `CitationFilterChoices` (four filters in one grid, group "Queue filter"),
  search with glyph, `/` cap and Escape, the freshness line, the missing deep
  link line, one `LoadErrorState` for the queue (Open Review portal kept), the
  empty and no-match states, the windowed list with fixed rows (title, blocking
  and ready counts, holder, rows and accepted, relative time) and a key hint.
  `CitationArticlePane` (new) docks right: title, one tally line, "Last
  change", Open in Review, pager (`j`/`k`) and Back to list below `lg`, the
  hidden-by-list line ("Not in the Open list after your decision", "Your
  search hides this article"), "Where it stands", the sections, the folded
  "Markers in the article text", and the dock (result notice, the other
  article's undo, pending line, key hint, freeze line, hold line with Claim /
  Release through the Inbox's claims, "Approve N ready rows" with its reason and
  "Open the next unread row").
- Rows (`CitationEvidencePanels.tsx`): sections as open lists of disclosure
  rows (`h5 > button`, `ExpandIndicator`), "Opened" marks, one Blocking tone
  shown only while not accepted, supports as figures with source, reference,
  type, quality, how the quote matched and "Why it supports the claim",
  diagnostics as a readable list, a meta line with confidence and keys, reason
  lines under Approve and Reject, key caps on the active row, pending labels.
  The section approval ("Approve N in <Section>") shows from two ready rows,
  after the rows.
- Order and keys: rows hold their first order until Refresh; `o` opens the
  next unread ready row (and scrolls it in with focus on its toggle), `/`
  focuses search, `j`/`k` move articles and focus the pane heading; all in the
  `?` sheet.
- Results: row, section and set undos stay beside what they changed (`u`
  undoes; "Dismiss" instead of "Keep"); a drained article stays open with "left
  the Open list" and "Next waiting"; a decision on another article is offered in
  the dock with a link to it; freeze refusals read "Writes are paused, so that
  was not saved."; the address follows the picked article.
- Copy: Approve (verb) and Accepted (status), "ready to approve", section
  names in sentence case from the catalog, checklist in plain words ("Markers
  in the article text", no "dev draft"), empty states per filter ("All clear").
- New modules: `CitationArticlePane.tsx` (`CitationArticlePane`, `KeyCap`,
  `RelativeTime`, `CitationPaneSkeleton`), `citationPaneModel.ts` (`tallyRows`,
  `describeTally`, `describeQueueTotals`, `describeEmptyFilter`,
  `describeListCount`, `summaryBlockingGaps`, `rowsChangedSince`,
  `rowsMovedSinceDecision`, `describeConflict`, `CITATION_FREEZE_COPY`) with
  tests. `CitationQueueHeader`, `CitationSelectedSummary`,
  `CitationChecklistPanel`, `CitationBulkApprovePanel` and the tone tiles are
  gone. `useCitationReviewData` gains claims, `actionFailure` (failed, frozen,
  conflict), `pendingStatus`, `isUndoing`, `missingSlug`, `keepSelection`;
  `CitationReviewTab` takes `actorEmail` (the shell passes `userEmail`).
- Shared, backward compatible: `NextDevRouteClient` drains the library for
  every `tabNeedsLibrary` tab (Tags unchanged); `EditorCitationDiagnosticsPanel`
  labels use `type-meta-label` (also in the Substances references form).
- Journeys fixtures: `seedCitationEvidence` (LSD with every row state, MDMA,
  Ketamine with a rejection, Caffeine, fully accepted Psilocybin) and
  `citationQueueSummaries`; `/api/citation-evidence/queue` answers every filter
  from the rows, `/api/citation-evidence?slug=` the rows, the status POST (admin
  floor, freeze) changes them; under `conflicted` another admin accepts the
  article's first ready row after the first read. The Inbox's citation seed is
  derived from the same rows, so it lists four articles. With a unit test.

Deferred, with reasons:

- A source link per quote and the article sentence with its marker in place:
  the evidence payload has no source URL and a field path does not reliably
  name one sentence; both need server fields.
- Disabling decisions while writes are frozen: the Inbox decision (buttons stay
  enabled so the next write can clear the freeze); the dock says it.
- Moving the single-row result and Undo into the dock: tests and the earlier
  design keep it in the row, next to the buttons that made it (see Conventions).
- A second reviewer for harm-critical sections, per-quote approval, and handing
  gaps back to a research queue: product and server decisions.
- Article titles in the Inbox's citation rows: its adapter has no corpus; the
  Inbox pass owns that surface.


### Pass 17: Index layout (`/dev/index-layout`)

Commit: see `git log --grep "Dev tools redesign: Index layout"`.
Screenshots: `tmp/redesign/index-layout/before/` and
`tmp/redesign/index-layout/after/` (admin loaded dark and light, full page;
editor, editor_translator, translator and contributor; layouts loading and
failed; empty; library loading; Chemical; Mechanism; Hallucinogens and
Psychedelic views; hover; row menu and Move to; category and section menus;
name and icon, add section, rename, remove category, remove section dialogs;
new category; add picker; dragging; touch drag (`_touch-mid.png` mid-gesture);
dirty; undone; redone; revert confirm; tray, hidden, place; finder and a pick;
keys sheet; focus after a removal; commit confirm, committed, frozen,
conflict; editor submitted; server check blocking; desktop and phone), captured
by `tmp/redesign/index-layout/capture.mjs`. Critique in
`tmp/redesign/index-layout/critique.md` (19/40 before; design review in
`assessment-a.md`), inventory with the item-by-item check in
`tmp/redesign/index-layout/inventory.md`, detector evidence in
`tmp/redesign/index-layout/detector/` (static scan clean before and after; the
in-page detector is blocked by the page CSP).

Main changes:

- P0 fixes: a dataset whose category had no `sections` key (Mechanism in the
  fixtures, a shape the public loader accepts) crashed the whole editor to the
  route error page; `normalizeManual` (`layoutModel.ts`) reads missing lists as
  empty at the board, the tool and the contextual editor, and an edit through a
  normalized copy hands the stored manual back on a no-op so the trail never
  records nothing. On phones the Radix "Move to" / "Place in" submenus opened
  off the left edge, the only way to move a row between lists without a long
  touch drag; they are now `LayoutMoveDialog`, a filtered list picker.
- Working changes: the tool leaves the shell's `commitPanel` for
  `commitControls` through the new shared `DevWorkingChangesPanel` (Tags' panel
  now composes it too). It says which layouts changed, lists the changes in
  words per dataset (`describeLayoutChanges`: moved from and to, placed, taken
  out of the index, added to a second list, categories and sections added,
  removed, renamed, reordered, icon changed; capped at five with Show all),
  passes the same lines to `requestCommit(lead)`, rewords a revision conflict
  ("Someone published a newer index layout after you started, so nothing was
  committed.") with "Load the latest layout" behind a destructive confirm
  (refetches the layouts and resets the changed datasets; other tools' changes
  stay), and reads a failure under the freeze as the freeze. Cmd+S commits
  (asks first) or submits. After a commit or a submission the undo trail is
  forgotten, and a submitted dataset says "Submitted for review; not live
  until an admin applies it." instead of "Same as the live index".
- Layout: an "Index layout" section with a one-sentence description; the
  datasets as a three-column choice (icon and full name from `sm`, short name on
  phones, category count, unsaved dot with ", uncommitted changes"); New
  category and Revert layout beside it; one dataset line (categories,
  substances placed, public substances left out, then Changed / Same as the
  live index / Submitted); "Find a substance on the board" (`/`, matches with
  where they live, a pick focuses the row or opens the list picker for one
  outside the index); the public tab strip from `md` and a "Tab of the public
  index" select below; the board with the unplaced tray as a sticky right
  column from `xl` (a folded disclosure with its count above the board below
  `xl`); a sticky History dock (Undo and Redo with caps, the last change in
  words, "Review and commit").
- Rows (`LayoutDrugRow`): the grip names the list and position and has a 44px
  halo; arrows only on fine pointers; the menu opens with the name and place,
  explains a Missing or Hidden pill, and holds Move up, Move down, Move to the
  top, Move to the end, Move to another list and Remove from this list. Names
  wrap instead of truncating, pills ride inline after the name, rows the
  working changes put there carry an unsaved dot with ", changed". Tray rows
  have a Place button. Focus goes to the moved row after the list picker and
  to the next row after a removal.
- Card and section menus: a pencil trigger (the card's collapse indicator is
  the only ellipsis now), always drawn, 44px halo; a header with the name; a
  disabled Move up or down says why under it; dialogs use `EditorField`, turn
  off Save while nothing changed, and the icon field suggests every key in the
  icon map (`CATEGORY_ICON_KEYS`, new export in
  `src/data/config/categoryIcons.ts`).
- Drag: `MouseSensor` (4px), `TouchSensor` (hold 180ms, 8px) and
  `KeyboardSensor`, announcements naming the substance and the list, and screen
  reader instructions.
- History: `useLayoutHistory` steps carry labels; `edit` returns whether
  anything changed; `undoLabel`, `redoLabel`, `forgetAll`; every operation is
  named ("Moved LSD to Dissociative", "Undid: ...") in the dock's live line.
- Confirms: copy unchanged (test-guarded); `affectedLabel` "Holds N
  substances" and "Moves N substances to X".
- Readiness (the shell's `IndexLayoutReadinessPanel`): `LoadErrorState`
  "Could not load the index layouts" with Try again; the loading label is
  "Loading the index layouts".
- Contextual editors: the public `/substances` layout editor uses the list
  picker, the normalized board, `CopyIndexRefusal` (freeze: "Writes are paused,
  so your changes were not published."; conflict: "Someone published this
  layout after you opened it" with "Load the latest version" behind a
  destructive confirm, which refetches and restarts the draft keyed on the
  revision), notices instead of bare paragraphs, and no trailing ellipses. The
  index item editor says "Display name" and reads a 503 freeze as a definite
  refusal with the freeze sentence.
- Shared, backward compatible: `DevWorkingChangesPanel` (new, with a test);
  `DevCommitCard` loses its "Live site" / "Review queue" eyebrow (the kicker
  ban; the title already says where the draft goes); the controller returns
  `indexLayoutTabProps` beside `tagEditorTabProps`; `CATEGORY_ICON_KEYS`.
- Journeys fixtures: `INDEX_LAYOUTS_SEED` is now a realistic psychoactive
  layout (sections with Common and Other, a General list beside sections, a
  missing slug, a direct-URL-only article placed, an empty category, two public
  substances and one hidden left out), a sparse chemical layout and a mechanism
  category with no `sections` key; `LIBRARY_PRIORITY_SEED` makes two articles
  direct-URL-only; the layouts are stored per fixture, `POST /api/save-article`
  applies `indexLayouts` with the route's revision check, and under
  `conflicted` another admin publishes the psychoactive layout first so the
  commit is refused with `EDIT_CONFLICT`. Corpus tools now see these layouts.

Deferred, with reasons:

- Staging the `/substances` contextual layout editor into the shell's working
  set instead of publishing on its own: changes that editor's save model; it now
  recovers from conflicts and the freeze instead.
- Warning before a commit that a layout moved on (the document session's
  `refreshConflict` is not exposed per manual): the refusal is caught on commit
  with its way forward.
- Reordering categories and dragging sections: category placement on the All
  tab is the page's column table in code; the new-category popover says where a
  card lands, and sections move by menu with their pin rule said.
- An empty layout (zero categories) from the server reads as a failed load: the
  shared `useIndexLayouts` parse rejects it; the tool's own empty board (with
  "Add a category") shows when a draft is emptied.
- Card titles still break inside long words in narrow columns ("Sedative-
  hypnotics"): the shared public `IndexCard` title; the edit trigger is one
  28px control now.
- The commit sheet's scope row ("2 categories", "Commit 2 changes") and the
  success sentence with the submitter: the shared save orchestrator, as the
  Tags pass recorded.
- Multi-select moves: a new batch operation over the layout ops.


### Pass 18: Glossary (`/dev/glossary`, the translation workbench)

Commit: see `git log --grep "Dev tools redesign: Glossary"`.
Screenshots: `tmp/redesign/glossary/before/` and `tmp/redesign/glossary/after/`
(admin Inbox dark and light, full, a reason filter, a picked item, accepted,
frozen accept, key accept with Undo; translator on an empty Inbox and on German;
Terms dark and light, open, full, Continue, dirty, saved, approved, frozen,
conflicted, history, where used, search and no match, More menu, reviewed
language, new language, translator; Confirm all, Approve all and collision
dialogs; Interface text, dirty, short labels, waiting for refresh; Style guide
and full; Articles, full, an open article, a deep-linked paragraph, Coverage,
Recent changes, Reader feedback, Runs; legend; empty, empty Terms, failed,
loading; editor locked; editor_translator; desktop and phone), captured by
`tmp/redesign/glossary/capture.mjs`. Critique in
`tmp/redesign/glossary/critique.md` (18/40 before; design review in
`assessment-a.md`), inventory with the item-by-item check in
`tmp/redesign/glossary/inventory.md`, detector evidence in
`tmp/redesign/glossary/detector/`.

Main changes:

- P0 fixes: a freeze refusal showed the server string (env var name, "the
  fixture") beside a live-looking Approve; every glossary write now reads it
  as "Writes are paused, so that was not saved." A revision conflict said
  "Reload" with no control; the row now offers "Load the latest version"
  (reloads the language, drops only that row's typed wording, asks first when
  there is some). Inbox results landed above a 17-card list and model and bulk
  results at the page top; the Inbox result sits in its dock, bulk, import and
  draft results in the Terms dock, and run results under the Runs buttons.
  Disabled accent buttons read as live; blocked main actions are outline and an
  Inbox item with nothing to accept shows Edit as its main action.
- Frame: `EditorNavTabs` "Workbench view" with counts (Inbox waiting, terms
  and interface text to review; omitted while unknown) over kept-mounted
  `role="tabpanel"` panels; Language as a field (a fact for one language,
  "· live on the site" for the live mirror); Refresh (icon on phones); the
  legend drawn with the pills it defines, as a popover from `sm`; the status
  line formatted, empty for a language with nothing translated; "Opened from
  the Inbox. Back to the Inbox" after an Inbox Edit. The registry now says
  `saveLine: "in-tool"` and the header carries `SaveLine` with the tool's own
  sentence (`GLOSSARY_SAVE_COPY`), which the freeze replaces.
- Inbox (`ReviewInbox.tsx`): the triage workspace. List column ("Waiting",
  count, Reload icon, a labelled Reason select with counts, compact rows with
  scope glyph, reason pill, English and finding, the single-key toggle and key
  hint under the list) and a pane (scope, place in words, reason, pager with
  j/k, Back to list below `lg`, English and Readers see side by side, Approved
  for, Suggestion, Found, Written by) with a decision dock (the live region
  with the 10-second Undo and results, the glossary conflict with its Fine
  here, Accept / Fine here / Edit / Skip with key caps, and one sentence on
  what Accept does for this item). Empty says All clear with what was checked
  folded. Phones: master/detail.
- Terms (`TermsWorkspace.tsx`): progress card (legend under the bar, the never
  checked segment in the info tone, "Open Runs" for admins); categories as
  link rows with a left count and a bar; search with `/`; the four states as a
  two-by-two choice with counts; More beside the heading; the open category in
  a pane (name, bar, counts, Approve all / Confirm all with their counts, Back
  to list and Close below `lg`), rows as open list items (English, definition,
  kind and who wrote it on the left; status, "Readers see", the field, reason,
  actions and the row's result on the right; Where it is used and History under
  both at full width); a dock with whole-list results, the running write, the
  unsaved line and "Continue with <next category>". Search lists every match
  grouped, and a status filter that empties it says "Found under Approved (3)".
  Bulk confirms list each term with its wording under "Confirms N terms".
- Interface text: one vocabulary (Machine, Unreviewed, English changed,
  Approved, Not in the site build), the three modes as a three-column choice
  with counts, search with `/` in the view, Reload as an icon, labels as rows
  (English and context left with "Where it appears" folded; facts, field,
  reason, actions, history right), the range line on top and the pager after
  the list. Short labels: a sticky selection bar ("N selected of M", Approve
  selected accent only when something is chosen, selection as ghost buttons,
  the batch result in the bar) and rows that stack on phones. Waiting for
  refresh: a table that stacks on phones, one "Term not recorded" line.
- Articles (`ArticlesView.tsx`): sections instead of four drawers. Reader: the
  articles needing review as link rows (lead row, count, breakdown in words,
  five then Show all), the find field beside them, the slug fallback folded as
  "Open by address instead"; an open article is a panel (Back, "Open another
  article", "Open the English page" in a new tab, title, progress bar and
  tally, Review fluency for admins), paragraphs in two columns with sentence
  case pills and a pencil on hover, the correction editor with facts as a `dl`,
  a growing field, Escape to close, the unsaved line, receipts and history with
  relative times; translator's notes are one quiet "Add translator's note" line
  until one exists. Coverage: a headline with its bar, the breakdown and jobs
  lines, relative times, meta-label headings. Recent changes: grouped by day,
  the English once when unchanged. Reader feedback: readiness and evidence as a
  `dl` with relative times, the reactions table, then the reader suggestion
  queue. Runs: sentence-case "Latest run" label, results under the buttons.
- Style guide: a panel with `EditorField`s, examples as a `dl` (Before struck),
  "Add an example" with the reason it cannot be added yet, and a save dock
  (result, reason, actions, state phrase); history beside it with relative
  times.
- Keys: `/` (Terms and Interface text search), the Inbox's j/k/a/u/e/f/s (in
  the `?` sheet only while the Inbox is on screen), Escape closes a paragraph
  editor.
- New modules: `TermsWorkspace.tsx`, `ArticlesView.tsx`, `workbenchParts.tsx`
  (`SearchField`, `ChoiceGrid`, `KeyCap`, `BackToList`, `PaneDock`,
  `ResultNotice`, `RowSkeletons`, `When`); `glossaryModel` gains
  `GlossaryWriteRefusal` and `describeWriteRefusal`; `WorkbenchDrawer.tsx` and
  `GlossaryFilterBar` are gone.
- Journeys fixtures: `scripts/tools/journeys/translationFixtures.mjs`
  (glossary rows for Chinese, Dutch, German and Japanese in every review state,
  a shared-rendering pair, the approve / confirm / edit / gloss / import /
  history writes with the revision check, the collision acknowledgement, the
  locale assignment and the admin and editor floors, interface text, the
  inbox with every reason, articles, notes, style guides, coverage, changes,
  fluency, reactions, readiness and usage), with a unit test. German keeps
  the seven inbox items and Dutch none, so Home is unchanged.

Deferred, with reasons:

- Undo after a button Accept in the Inbox: no route reverses an approval; the
  keyboard accept keeps its 10-second window before anything is written.
- Article titles instead of slugs in Articles: the coverage and narrative
  payloads carry slugs only; a manifest lookup by slug does not exist.
- A pager between articles needing review inside the reader: the ranking is
  read once per view; picking the next article from the list is one step.
- Renaming the heading to match the rail ("Glossary") or the rail to match the
  heading: a vocabulary decision; the glyph now matches.
- The legend's "Draft (unreviewed)" and "Human approved" beside the Terms pills'
  "Unreviewed" and "Approved": the legend's words are test-guarded vocabulary.
- Removing the doubled ellipsis from `ExpandIndicator`: the kit's accessibility
  decision.
- Width transitions on the run progress bar (detector `layout-transition`):
  two segments in one track; the change is rare and reduced motion stops it.

### Pass 19: Molecules (`/dev/molecule-editor`)

Commit: see `git log --grep "Dev tools redesign: Molecules"`.
Screenshots: `tmp/redesign/molecules/before/` and `tmp/redesign/molecules/after/`
(admin idle dark and light; editor and contributor locked; empty; failed;
loading; To do filter; search and no match; LSD open dark and light; MDMA with
bold bonds; an article with no depiction; Salvinorin A with no SMILES; dirty and
dirty at the bottom; changed chemistry; publish confirm; published; conflict and
the Load the latest dialog; frozen; remove and switch dialogs; article preview;
bond pick; drawing on a phone; classes; templates, a new template, the apply
dialog; an unknown deep link; desktop and phone), captured by
`tmp/redesign/molecules/capture.mjs`. Critique in
`tmp/redesign/molecules/critique.md` (15/40 before), inventory with the
item-by-item check in `tmp/redesign/molecules/inventory.md`, detector evidence
in `tmp/redesign/molecules/detector/` (static scan clean).

Main changes:

- P0 fixes: a failed picker read threw to the route error page (rail
  included); the picker, the article's SMILES and the class member reads now go
  through non-throwing state hooks (`useMoleculePickerReadState`,
  `useMoleculeSourceReadState`; the throwing `useMoleculeSourceRead` stays for
  Review's quick editor) and the depiction list through `useEditorReadState`,
  each failure a `LoadErrorState` in place. The article preview sits in its own
  error boundary. Save published a live depiction with no confirm; it now asks
  with the live and new images side by side (Cmd/Ctrl+S opens the same
  confirm; templates, which publish nothing, save at once).
- Layout: the editor workspace, `layout: "full-bleed"` capped at
  `max-w-[100rem]`. `MoleculeListColumn.tsx` (sticky from `lg`): the kind of
  structure as a three-column choice with counts, a count line, All / To do /
  Edited (Saved for classes and templates) from the stored row's `source`
  (`moleculeListModel.ts`: none, automatic baseline, hand edit, template), search
  with `/`, rows grouped as the picker grouped them (publicly listed first, then
  psychoactive class) with the state pill, "Not publicly listed", relative save
  time, "Editing" and the unsaved dot; skeletons, "taking longer" with Try
  again, empty pointing to Substances, no-match with Clear the search and Show
  all, a line when the open record is hidden by the filter or not listed. The
  record combobox is gone; the import and member comboboxes stay.
- Pane (`MoleculeEditorWorkbench.tsx`): header with the name (sr-only
  "Editing"), key, state pill, "Saved <relative> by X", View live (new tab), one
  sentence on what the public page shows, engine status only while loading or
  failed, corner Close and Back to list below `lg`; Drawing (Adjust as a
  two-column grid on phones, the canvas sized to the viewport, the side column
  of brand preview, Canvas settings, Tracing image and Canvas keys beside it from
  `2xl` and under it below); Changed chemistry; "Start from something else"
  (the automatic layout with Revert to auto, another saved structure, pasted
  SMILES as an `EditorField` with Enter); In the article; Remove at the end with
  a sentence. Save dock: the result (conflict with "Load the latest version"
  behind a destructive confirm that re-reads the stored depiction and reloads
  the canvas; freeze "Writes are paused, so your changes were not published."),
  the stereo guard in words, the one reason Save is off, Save (names the
  outcome, key cap), Revert to saved, Apply to class for templates, the state
  phrase and `SaveLine`.
- Phone: master/detail with `useScrollToDetail`, a deep link scrolls the pane in;
  the canvas shows behind a Draw lock (see Conventions); the dock sticks in the
  thumb zone.
- Copy: no uppercase tracked labels (`type-meta-label`), no trailing ellipses,
  sentence-case guard pills, "Apply to N members", "Save class depiction",
  the remove confirm names the record and says there is no undo.
- Registry: `layout: "full-bleed"`, `saveLine: "in-tool"`.
- Journeys fixtures: `scripts/tools/journeys/moleculeFixtures.mjs`
  (`createMoleculeRoutes`: the picker from the editor library, SMILES for every
  article with Salvinorin A empty, ten stored depictions with fork-drawn MOL
  blocks and brand SVGs in every source, one morphinan template, class members,
  the depiction save with the admin floor, the `expectedUpdatedAt` check and a
  concurrent save under `conflicted`, removal, template save, the apply preview
  and write, the freeze through `toolWrite`); `/api/editor/molecule-overrides`
  now lists them, so other tools' article previews draw these depictions.

Deferred, with reasons:

- Keyboard drawing on the canvas and a non-pointer bond pick: OpenChemLib
  exposes no keyboard or AT affordance, and the fork is out of scope.
- The OpenChemLib canvas annotations ("abs", "this enantiomer"): drawn by the
  fork.
- A thumbnail per list row: the list read carries no SVG; per-row reads would
  be a new endpoint.
- Undo after publish or remove: no server history.
- The article preview in the screenshots shows its failure state: the journeys
  library article carries only the fields the corpus tools read, and
  `ArticleLayout` needs `routes`; a real article renders. Giving the fixture a
  whole article would move every corpus tool's baselines.

### Pass 20: Substances (`/dev/articles`, aliases `generator`, `gen`)

Commit: see `git log --grep "Dev tools redesign: Substances"`.
Screenshots: `tmp/redesign/substances/before/` and
`tmp/redesign/substances/after/` (admin idle dark and light; translator and
contributor locked; empty; library failed; search and no match; All; LSD open
dark and light, full page; editor on LSD; MDMA with a saved private draft;
Ketamine with the editor's returned proposal; loading; article failed;
Caffeine, which cannot be drawn; unknown deep link; session expired; dosage
panel, bottom, invalid, unit mismatch, changed, warnings; remove route;
interactions and a substance in two tiers; legality; close guard; inline field;
dirty and dirty at the bottom; switch guard; rail guard; discard confirm;
sections menu; review as admin and editor; publish confirm; published;
submitted; saved draft; conflict and the merge; frozen publish and frozen draft;
history; options menu; desktop and phone), captured by
`tmp/redesign/substances/capture.mjs`. Critique in
`tmp/redesign/substances/critique.md` (16/40 before), inventory with the
item-by-item check in `tmp/redesign/substances/inventory.md`, detector
evidence in `tmp/redesign/substances/detector/` (clean before and after).

Main changes:

- P0 fixes: a rail switch, Leave or sign-out dropped unsaved article edits
  silently (the tab never reported to the unsaved-work registry; it now does,
  with Save draft as the save, and the rail shows the unsaved dot). An article
  the renderer could not draw dropped the whole editor to the route error page;
  the article now sits in its own error boundary inside the pane and the dock
  and draft stay. The publish confirm did not show the doses it published; it
  now lists the changed sections, every dose, duration and interaction change
  before and after, and the warnings still standing (and turns destructive
  while they do).
- P1 fixes: a write-freeze refusal read as "Your last change was not
  confirmed" and paused editing behind a Retry that could not succeed; the
  lifecycle now reads the 503 as a definite refusal and the dock says "Writes
  are paused, so your changes were not published. Your edits stay here." A 409
  now says someone published after you opened it and offers "Load the latest
  version" (the merge panel) where Publish was pressed. Remove route asks,
  naming the route and the tiers that go with it. Guard dialogs no longer clip
  "Save draft and continue".
- Layout: the editor workspace, `layout: "full-bleed"` capped at
  `max-w-[100rem]`, `saveLine: "in-tool"`. `SubstanceListColumn.tsx`
  (sticky from `lg`): "Articles" meta heading and count line, Listed / Your
  work / All as a three-column choice with counts (All replaces "Include
  URL-only"; a deep link to an address-only article opens on All), search with
  `/` and Escape, Review state (with Changed since review) and Order selects,
  the windowed listbox with fixed 60px rows (name, address, review pill with
  "Not reviewed" neutral, "Your draft", "Proposal waiting", "Changes
  requested", "Address only", "Editing" and the unsaved dot), the hidden-by-
  filter line, no-match with Clear the search and Show everything, the unknown
  deep link line, key hint. Marks come from `/api/dev/my-work`
  (`workBySlug`); a failed read says so with Try again.
- Pane: header (name as the heading with sr-only "Editing", review pill, View
  live in a new tab, the address, corner Close, Back to list below `lg`), the
  session strip (your private draft with its relative save time, "This page
  shows your edits", a revision of a proposal, your proposal waiting with Open
  in Change Review, other proposals waiting with See them, the reader-feedback
  correction with Detach and Back to feedback), the article, and the save dock
  (result, pending line, blocker, Review N changes, Save draft with the Cmd+S
  cap, Edit a section with Changed and Needs a fix marks, Discard edits (in the
  menu on phones), Editing options, the draft state phrase, `SaveLine`). Idle,
  loading (skeletons) and failed (with a sign-in link) panes.
- Section panel: a pinned footer (Apply to preview, which was the unlabelled
  eye "Preview locally", then Review, Save draft with Cmd+S, Cancel), the
  validation issues as a list above it, the article named in the description.
- Dosage form: sentence-case labels, fieldsets "Dose ranges" and "Duration",
  the route's unit line, warnings for mixed units (which tiers use which),
  out-of-order and overlapping tiers, a change of more than double or less than
  half, a stage longer than the total and a duration without a time unit,
  "Live: 50-150 ug" under each changed value, a new route marked as not live,
  Add route focuses the new route. Interactions: the three tiers open in the
  tool with their severity colours and a warning for a substance listed in two
  tiers; the review sheet repeats it.
- Review sheet: a safety lead naming the dose, duration and interaction changes
  and their warnings, a shorter scope sentence, refusals under Publish, key hint
  hidden on touch; history reads summary first with "You" and a relative time.
- Keys: `/` and Cmd+S (Save draft, from the pane and inside a section panel),
  both in the `?` sheet.
- Shared, backward compatible: see Conventions (`ArticleContextBridge`
  `chrome`, `header`, `onWorkChange`; `ArticleWorkbenchChrome.tsx`;
  `PublishSheet` `lead`, `confirmBody`, `confirmAffectedLabel`,
  `confirmDestructive`, `result`; `ContextualEditorPanel` `footer`,
  `onKeyDown`; `ArticleSectionForm` `published`; `PublishedArticleProvider`;
  `CollapsibleEditorCard` `iconClassName`; `useDirtyGuard` wrapping footer;
  `useArticleLifecycle` `failure`, `clearFailure`, `pendingAction`,
  `draftSavedAt`; `ARTICLE_EDITOR_SECTIONS`; the shell's `libraryError`).
  The public page's contextual editor and Review keep the bar chrome; the
  section footer, the safety lead and confirm, and the freeze reading reach
  them too. No public module changed: every edited file is `.editor.tsx`,
  under `src/features/dev/`, `src/features/contextual-editing/`, or
  `src/features/article/editing/` outside `index.ts` and
  `ArticleEditContext.tsx`, which `public-editor-boundary.mjs` keeps out of the
  public build; `ArticleLayout` and the section components are untouched.
- Journeys fixtures: `scripts/tools/journeys/substanceFixtures.mjs` with
  `substanceArticlesSeed.json` (LSD, MDMA, Ketamine and Alcohol whole, from the
  archived public snapshot); the editor library's per-slug read answers them
  whole (so other tools' article previews now draw these four); the article
  lifecycle GET and POST (editor floor, admin floor for publish and restore, the
  summary rule, "No article content changed", draft version and base revision
  checks, a concurrent publish under `conflicted` just before the first publish
  or submit, the freeze); MDMA seeded with a saved draft, LSD with two
  revisions; submissions join the shared proposal list; `/api/dev/my-work`
  lists article drafts first. With a unit test.

Deferred, with reasons:

- A required source or reason for dose changes, and a second admin for
  safety-critical sections: server rules and a product decision.
- The empty corpus still reads as "Loading articles": the controller treats a
  drained-to-nothing corpus as loading on purpose (`useDevModePageController`);
  a failed corpus now shows its error.
- Threshold shows "10+ ug" in the form and "~10 ug" on the page: the shared
  range transformer's round trip is test-guarded; the form's "Live:" line uses
  the page's threshold wording.
- Dashed resting outlines on every inline value: the shared `EditableValue`
  affordance contract, also used by the public page's editor.
- Publication receipt wording ("editor host", "Translations: not reported"):
  `publicationNotice.ts` and the receipt chips are shared with the public
  page's editor and test-guarded.
- Display names in history and proposals: no directory for external emails
  (as earlier passes).
- `library-failed` before looked like idle because the fixture answered the
  library in every state; the capture now fails that read itself.

### Pass 21: Review (`/review`, `/review/<slug>`)

Commit: see `git log --grep "Dev tools redesign: Review"`.
Screenshots: `tmp/redesign/review/before/` and `tmp/redesign/review/after/`
(landing dark and light, full page; changed since review and its diff; reviewed;
on hold; notes, typed, added, a kept draft; ticked, undone, Next waiting; held;
class and section celebrations; finished and all reviewed; picker, search, no
match, `/`; More sheet and its settings; settings; help; the changed filter and
active filter chips; Editor view; inline editing; molecule; citations; editor
role (recommend, recommended, pending, stale recommendation) and
editor_translator; loading, article loading, article failed, an article that
cannot be drawn, library failed, empty; frozen tick and flag; refused tick
(expired session); publish conflict and frozen publish through the bar
chrome; a section form; the review sheet; the draft guard; desktop and phone),
captured by `tmp/redesign/review/capture.mjs`. Critique in
`tmp/redesign/review/critique.md` (22/40 before; design review in
`assessment-a.md`, 47 findings), inventory with the item-by-item check in
`tmp/redesign/review/inventory.md`, detector evidence in
`tmp/redesign/review/detector/` (clean before and after; the in-page detector
could not be injected).

Main changes:

- P0 fixes: an article the renderer could not draw dropped the whole workbench
  to the route error page; it now fails inside the article area
  (`ReviewArticleView` error boundary, "X could not be drawn" with Try again,
  Next article and Open in Substances) and the tick is off with the reason
  (stricter than before: an article nobody could read cannot be signed off).
  The bar chrome of `ArticleContextBridge` got the same net, so a draft that
  cannot draw keeps the editing bar. The changed-since-review diff showed two
  whole paragraphs unmarked; it now counts the changes, leads with a warning
  block of the dose, duration and interaction changes (`safetyChanges`), and
  marks changed words.
- The review dock (see Conventions): Hold (H), Notes and flags (F, with the
  flag count and an unsaved-draft dot), and the verdict (Mark as reviewed,
  Reviewed with "Mark not reviewed", Recommend as reviewed, Recommended,
  Recommend again) moved out of the bar, labelled at every width; the phone
  thumb zone now holds them. Results moved from a floating toast into the
  dock: "Marked X reviewed." with Undo (U) for 30 seconds (was 8), the
  completion as its title, and "Next waiting: <name>" (N). A refused write
  reads in the dock (`describeReviewRefusal` in `reviewDockModel.ts`: the
  freeze sentence, a lapsed sign-in with "Sign in in a new tab", the admin
  floor), and the freeze line stays while writes are paused.
- Bar: "Leave review" (through the draft guard), the pager as outline icon
  buttons with `aria-keyshortcuts` (← / k, → / j), the picker, "N of M" (and
  "shown" when filtered); from `lg` the view tabs, Molecule, Citation, Inline
  editing (labels and caps from `xl`), Open in, Queue settings (spoken dot),
  Class trophies and help; the More sheet holds them below `lg` in View, Tools
  and Queue settings sections. Active filters show as chips under the bar.
- Picker: matches highlighted in names and buckets, sentence-case state pills
  toned by state, spoken bucket counts, "No article matches X" with Clear the
  search, `/` opens it, the trigger names the state.
- Notes and flags: `EditorField` labels, the note grows with its words, the
  flag list is an open list with sentence-case severity pills, section and
  "Added by", a live "Added" line, pending labels, refusals in the tool's
  words, drafts kept per article when the panel closes or the reviewer moves
  on, focus back to the Notes button on close.
- Settings: `EditorField` and `EditorCheckbox` in Queue, Flags and Reading
  groups, flag labels as removable chips, "Reset to defaults".
- States: the stale notice stacks on phones and says when it was signed off;
  the stale dot uses the info tone, not the accent; an article-shaped skeleton
  while one body loads; `LoadErrorState` for a failed body (with Next
  article), a failed queue and a missing category layout (with a way out); an
  empty queue points to Substances; the finished state says what a sign-off
  means; the class card sits above the dock, not over the text.
- Keys: N and `/` and H added; ← / → also k / j; the help lists keys as real
  text in `theme-dev-kbd` caps.
- Shared, backward compatible: `ArticleChangeDiff` word marks;
  `ArticleContextBridge` bar chrome gains the draw boundary and keeps a refused
  publish (freeze, conflict with Load the latest version) in the bar once the
  review sheet closes; `.theme-review-status-stale` uses the info tone;
  `devShellSession` serves `/review` too.
- Journeys fixtures: `scripts/tools/journeys/reviewFixtures.mjs`
  (`seedReviewRecords`, `createReviewRoutes`: the category layout, published
  revisions, the signed-versus-current article for LSD, source stats, the
  editorial review writes with the editor floor, the admin floor for a
  sign-off, the flag word rule, recommendations and the freeze;
  `setStatus`, `completeAll`, `completeAllBut` for scenarios). Library rows
  carry `editorial_review`, so the Substances list now shows real review
  states (LSD reads Changed since review, Ketamine Reviewed). With a unit test.

Deferred, with reasons:

- Display names for reviewers and flag authors: no directory maps member
  emails to names (as earlier passes).
- Disabling the verdict while writes are frozen: the Inbox decision (buttons
  stay enabled so the next write can clear the freeze); the dock says it.
- A per-article free note separate from flags: the route stores notes only
  inside a flag; drafts are kept and the field says so instead.
- The molecule quick editor's internals (renderer state, mono slug): Molecules
  owns `MoleculeQuickEditor`.
- Opening the stale diff by default: the tested load-on-demand stays; the
  notice leads with what to do.

Follow-up commit "Review: open the changes before re-signing a changed article"
(decided by the owner): the re-sign-off gate in Conventions. Stricter than
before: a stale article now takes two presses. The two R-on-stale tests now
press twice; new tests cover the first press opening the diff and writing
nothing, the second writing the same request, changes opened by hand, one step
for an article that is not stale, and the reset on navigation. Screenshots
`gate-open-*` and `gate-signed-*` in `tmp/redesign/review/after/`.

