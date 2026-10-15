"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CodeSurface,
  ConfirmDialog,
  DESKTOP_ONLY_NOTICE,
  DesktopOnlyNotice,
  DevShortcutsProvider,
  DiffSurface,
  EditorActionGroup,
  EditorBackLink,
  EditorActionStatus,
  EditorCheckbox,
  EditorField,
  EditorFieldRow,
  EditorList,
  EditorListItem,
  EditorListRow,
  EditorNavTabs,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorSection,
  EditorSegmentedControl,
  EditorSelect,
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
  EditorToolbar,
  LoadErrorState,
  MERGE_CONFLICT_COPY,
  MergeConflictChoices,
  NOTICE_AUTO_CLEAR_MS,
  Notice,
  SAVE_LINE_COPY,
  SaveLine,
  TagToken,
  TriageShortcutHint,
  UnsavedWorkProvider,
  WRITE_FREEZE_CODE,
  WRITE_FREEZE_COPY,
  clearWriteFreeze,
  isTextEntryTarget,
  isWriteFreezeRefusal,
  reportWriteFreeze,
  saveLineCopy,
  unresolvedConflictText,
  useConfirm,
  useDevShortcutList,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useTriageShortcuts,
  useUnsavedWork,
  useUnsavedWorkRegistry,
  useWriteFreeze,
  useWriteFreezeObserver,
} from "@/features/dev/components";

import type { StoryDef } from "../registry/types";

const IMPORT_LINE = (names: string) => `import { ${names} } from "@/features/dev/components";`;

function NoticeDismissDemo() {
  const [open, setOpen] = useState(true);
  return open ? (
    <Notice tone="danger" title="Save failed" dismiss={() => setOpen(false)}>
      Postgres rejected the write. This stays until you dismiss it.
    </Notice>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
      Show the error again
    </Button>
  );
}

const noticeStory: StoryDef = {
  id: "editor-notice",
  name: "Notice",
  tier: "editor",
  status: "stable",
  summary:
    "The one notice for dev tools: loading, success, warning and error, in page or inline placement, with one dismissal rule.",
  source: "src/features/dev/components/Notice.tsx",
  importLine: IMPORT_LINE("Notice"),
  exports: ["Notice", "NOTICE_AUTO_CLEAR_MS"],
  examples: [
    {
      label: "Page placement, every tone",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <Notice tone="loading" message="Loading the stored copy for this block." />
          <Notice tone="info" title="Read only" message="Your role can read this tool." />
          <Notice tone="success" message="Saved to Postgres." />
          <Notice tone="warning" message="Publication has not been confirmed." />
          <Notice tone="danger" title="Save failed" message="Postgres rejected the write." />
        </div>
      ),
    },
    {
      label: "Inline placement",
      note: "Beside the control that caused it.",
      render: () => (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline">Copy diff</Button>
          <Notice placement="inline" tone="success">Copied to clipboard</Notice>
          <Notice placement="inline" tone="danger">Copy failed</Notice>
          <Notice placement="inline" tone="loading">Saving</Notice>
        </div>
      ),
    },
    {
      label: "Dismissible error",
      note: `Errors persist until dismissed; successes clear after ${NOTICE_AUTO_CLEAR_MS / 1000} seconds.`,
      background: "plain",
      full: true,
      render: () => <NoticeDismissDemo />,
    },
  ],
  props: [
    { name: "tone", type: '"neutral" | "info" | "loading" | "success" | "warning" | "danger"', default: '"neutral"', description: "Only danger is announced as an alert; every other tone is a polite status." },
    { name: "placement", type: '"page" | "inline"', default: '"page"', description: "Page banner, or a pill beside the control." },
    { name: "dismiss", type: "() => void", description: "Clears the notice. Errors wait for it; successes call it themselves after autoClearMs." },
    { name: "autoClearMs", type: "number | null", default: "NOTICE_AUTO_CLEAR_MS", description: "Success auto-clear delay. Off by default when the notice carries actions." },
    { name: "title / message / children / icon / actions", type: "ReactNode", description: "Content slots. A NoticeMessage held in state spreads straight in." },
  ],
  whenToUse: ["Every save, load and action result in a dev tool or in-page editor."],
  whenNotToUse: ["A static label or count: use EditorStatusPill."],
};

const desktopOnlyNoticeStory: StoryDef = {
  id: "editor-desktop-only-notice",
  name: "DesktopOnlyNotice",
  tier: "editor",
  status: "stable",
  summary: "Shown where a tool step has no touch grammar and stays read-only on a coarse pointer.",
  source: "src/features/dev/components/DesktopOnlyNotice.tsx",
  importLine: IMPORT_LINE("DesktopOnlyNotice, DESKTOP_ONLY_NOTICE"),
  exports: ["DesktopOnlyNotice", "DESKTOP_ONLY_NOTICE"],
  examples: [
    {
      label: "Default",
      note: DESKTOP_ONLY_NOTICE,
      background: "plain",
      full: true,
      render: () => <DesktopOnlyNotice title="Reorder on desktop" />,
    },
  ],
};

const panelStory: StoryDef = {
  id: "editor-panel",
  name: "EditorPanel",
  tier: "editor",
  status: "stable",
  summary: "The dev tool card: a panel with a header (eyebrow, title, actions) and a body.",
  source: "src/features/dev/components/EditorPanel.tsx",
  importLine: IMPORT_LINE("EditorPanel, EditorPanelHeader, EditorPanelBody"),
  exports: ["EditorPanel", "EditorPanelHeader", "EditorPanelBody"],
  examples: [
    {
      label: "Header and body",
      background: "plain",
      full: true,
      render: () => (
        <EditorPanel className="w-full">
          <EditorPanelHeader eyebrow="Tool" icon="lucide:tags" title="Tags" description="Every tag in use." actions={<EditorStatusPill tone="info">12 tags</EditorStatusPill>} />
          <EditorPanelBody>Panel content.</EditorPanelBody>
        </EditorPanel>
      ),
    },
    {
      label: "Danger variant",
      background: "plain",
      full: true,
      render: () => (
        <EditorPanel variant="danger" className="w-full">
          <EditorPanelBody>Merging contributors cannot be undone.</EditorPanelBody>
        </EditorPanel>
      ),
    },
  ],
};

const sectionStory: StoryDef = {
  id: "editor-section",
  name: "EditorSection",
  tier: "editor",
  status: "stable",
  summary: "A titled section of a tool with an icon, description and header actions.",
  source: "src/features/dev/components/EditorSection.tsx",
  importLine: IMPORT_LINE("EditorSection"),
  exports: ["EditorSection"],
  examples: [
    {
      label: "Default",
      background: "plain",
      full: true,
      render: () => (
        <EditorSection animate={false} icon="lucide:history" title="Save history" description="Every save, newest first." actions={<EditorStatusPill>3 saves</EditorStatusPill>}>
          <p className="text-sm">Section content.</p>
        </EditorSection>
      ),
    },
  ],
};

const fieldStory: StoryDef = {
  id: "editor-field",
  name: "EditorField",
  tier: "editor",
  status: "stable",
  summary: "Label, description, counter and error wired to one control; EditorFieldRow lays fields out in columns.",
  source: "src/features/dev/components/EditorField.tsx",
  importLine: IMPORT_LINE("EditorField, EditorFieldRow"),
  exports: ["EditorField", "EditorFieldRow"],
  examples: [
    {
      label: "Two columns, one with an error",
      background: "plain",
      full: true,
      render: () => (
        <EditorFieldRow layout="twoColumn" className="w-full">
          <EditorField label="Title" description="Shown on the index card.">
            {(control) => <Input {...control} defaultValue="LSD" />}
          </EditorField>
          <EditorField label="Slug" error="Slugs are lowercase.">
            {(control) => <Input {...control} defaultValue="LSD" />}
          </EditorField>
        </EditorFieldRow>
      ),
    },
  ],
};

const selectStory: StoryDef = {
  id: "editor-select",
  name: "EditorSelect",
  tier: "editor",
  status: "stable",
  summary: "Native select styled for dev tools, with options as data.",
  source: "src/features/dev/components/EditorSelect.tsx",
  importLine: IMPORT_LINE("EditorSelect"),
  exports: ["EditorSelect"],
  examples: [
    {
      label: "Default",
      render: () => (
        <EditorSelect aria-label="Status" defaultValue="pending" options={[{ value: "pending", label: "Pending" }, { value: "accepted", label: "Accepted" }]} />
      ),
    },
  ],
};

const checkboxStory: StoryDef = {
  id: "editor-checkbox",
  name: "EditorCheckbox",
  tier: "editor",
  status: "stable",
  summary: "Checkbox with a label and optional description.",
  source: "src/features/dev/components/EditorCheckbox.tsx",
  importLine: IMPORT_LINE("EditorCheckbox"),
  exports: ["EditorCheckbox"],
  examples: [
    { label: "Default", render: () => <EditorCheckbox label="Keep a copy in the source field" description="The tag stays where it was." /> },
    { label: "Danger", render: () => <EditorCheckbox tone="danger" label="I understand this rewrites every article" /> },
  ],
};

const toolbarStory: StoryDef = {
  id: "editor-toolbar",
  name: "EditorToolbar",
  tier: "editor",
  status: "stable",
  summary: "Toolbar and labelled action groups, the status pill used for labels and counts, and the save-state pill.",
  source: "src/features/dev/components/EditorToolbar.tsx",
  importLine: IMPORT_LINE("EditorToolbar, EditorActionGroup, EditorStatusPill, EditorActionStatus"),
  exports: ["EditorToolbar", "EditorActionGroup", "EditorStatusPill", "EditorActionStatus"],
  examples: [
    {
      label: "Toolbar with groups",
      background: "plain",
      full: true,
      render: () => (
        <EditorToolbar label="Citation review actions" variant="split" className="w-full">
          <EditorActionGroup label="Row decisions">
            <Button type="button" size="sm">Approve</Button>
            <Button type="button" size="sm" variant="outline">Reject</Button>
          </EditorActionGroup>
          <EditorActionStatus status="dirty" />
        </EditorToolbar>
      ),
    },
    {
      label: "Status pills",
      render: () => (
        <div className="flex flex-wrap gap-2">
          {(["neutral", "info", "success", "caution", "warning", "danger"] as const).map((tone) => (
            <EditorStatusPill key={tone} tone={tone}>{tone}</EditorStatusPill>
          ))}
          <EditorActionStatus status="saving" />
          <EditorActionStatus status="saved" />
          <EditorActionStatus status="error" />
        </div>
      ),
    },
    {
      label: "Inline, inside a sentence or a row button",
      note: "`inline` renders the pill as a span, so it is valid inside a p, a label or a button. Pills speak in sentence case; never pass uppercase or tracking.",
      render: () => (
        <p className="theme-text-secondary text-sm">
          Diazepam is <EditorStatusPill tone="success" inline>Live on 5 substances</EditorStatusPill> and{" "}
          <EditorStatusPill tone="neutral" inline>Hidden on 1 by the cap</EditorStatusPill>.
        </p>
      ),
    },
  ],
};

const listItemStory: StoryDef = {
  id: "editor-list-item",
  name: "EditorListItem",
  tier: "editor",
  status: "stable",
  summary: "A selectable rail row (button) and its static twin (div) with title, subtitle, badge and leading slot.",
  source: "src/features/dev/components/EditorListItem.tsx",
  importLine: IMPORT_LINE("EditorListItem, EditorListRow"),
  exports: ["EditorListItem", "EditorListRow"],
  examples: [
    {
      label: "Active and idle",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-2">
          <EditorListItem active title="LSD" subtitle="Reviewed" badge={<EditorStatusPill tone="success">Live</EditorStatusPill>} />
          <EditorListItem title="Psilocybin" subtitle="Draft" />
          <EditorListRow title="Static row" subtitle="Not selectable" />
        </div>
      ),
    },
  ],
};

type DemoRow = { id: string; name: string };
const DEMO_ROWS: DemoRow[] = [
  { id: "lsd", name: "LSD" },
  { id: "psilocybin", name: "Psilocybin" },
  { id: "mescaline", name: "Mescaline" },
];

function EditorListDemo() {
  const [selected, setSelected] = useState<string | null>("lsd");
  return (
    <EditorList
      label="Substances"
      items={DEMO_ROWS}
      getKey={(row) => row.id}
      selectedKey={selected}
      onSelect={setSelected}
      emptyText="No substances match."
      search={{ placeholder: "Search substances", matches: (row, query) => row.name.toLowerCase().includes(query.toLowerCase()) }}
      renderItem={(row, { selected: isSelected }) => <EditorListRow active={isSelected} title={row.name} />}
    />
  );
}

type TriageRow = { id: string; title: string; detail: string; pill?: string };
const TRIAGE_ROWS: TriageRow[] = [
  { id: "halcyon", title: "Halcyon at the lake", detail: "LSD 100 µg · Waiting since Jan 2", pill: "Accepted" },
  { id: "festival", title: "Fixture festival notes, part two", detail: "MDMA 100 mg · Waiting since Jan 6" },
  { id: "drive", title: "Night drive home", detail: "Cannabis 10 mg · Waiting since Jan 10", pill: "New" },
  { id: "static", title: "Forty minutes of static", detail: "DMT 40 mg · Waiting since Jan 13" },
];

function EditorListTicksDemo() {
  const [selected, setSelected] = useState<string | null>("festival");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(["drive"]));
  return (
    <EditorList
      label="Trip reports"
      items={TRIAGE_ROWS}
      getKey={(row) => row.id}
      selectedKey={selected}
      onSelect={setSelected}
      estimateRowHeight={68}
      emptyText="Nothing waits."
      multiSelect={{
        checkedKeys: checked,
        onToggle: (key) =>
          setChecked((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          }),
        checkLabel: (row) => `Select ${row.title}`,
      }}
      renderItem={(row, { selected: isSelected }) => (
        <EditorListRow
          active={isSelected}
          title={row.title}
          subtitle={row.detail}
          badge={row.pill ? <EditorStatusPill tone={row.pill === "New" ? "info" : "success"} inline>{row.pill}</EditorStatusPill> : undefined}
        />
      )}
    />
  );
}

const listStory: StoryDef = {
  id: "editor-list",
  name: "EditorList",
  tier: "editor",
  status: "stable",
  summary: "The shared master list: search, keyboard selection, optional multi-select, and virtualised rows.",
  source: "src/features/dev/components/EditorList.tsx",
  importLine: IMPORT_LINE("EditorList"),
  exports: ["EditorList"],
  examples: [
    { label: "Searchable list", background: "plain", full: true, render: () => <EditorListDemo /> },
    {
      label: "Bulk ticks, rows of different heights",
      note: "Rows are measured one by one, so a row with a pill may be taller. Ticks take a 44px column under a coarse pointer; while a row is selected the focus cue is its border. Render EditorListRow (never a button) inside the list.",
      background: "plain",
      full: true,
      render: () => <EditorListTicksDemo />,
    },
  ],
};

const tableStory: StoryDef = {
  id: "editor-table",
  name: "EditorTable",
  tier: "editor",
  status: "stable",
  summary: "Responsive table whose cells carry their column label for the stacked mobile layout.",
  source: "src/features/dev/components/EditorTable.tsx",
  importLine: IMPORT_LINE("EditorTable, EditorTableHead, EditorTableHeading, EditorTableBody, EditorTableRow, EditorTableCell"),
  exports: ["EditorTable", "EditorTableHead", "EditorTableHeading", "EditorTableBody", "EditorTableRow", "EditorTableCell"],
  examples: [
    {
      label: "Two rows",
      background: "plain",
      full: true,
      render: () => (
        <EditorTable>
          <EditorTableHead>
            <EditorTableHeading>Code</EditorTableHeading>
            <EditorTableHeading>Role</EditorTableHeading>
          </EditorTableHead>
          <EditorTableBody>
            <EditorTableRow>
              <EditorTableCell label="Code">A1B2</EditorTableCell>
              <EditorTableCell label="Role">editor</EditorTableCell>
            </EditorTableRow>
            <EditorTableRow>
              <EditorTableCell label="Code">C3D4</EditorTableCell>
              <EditorTableCell label="Role">translator</EditorTableCell>
            </EditorTableRow>
          </EditorTableBody>
        </EditorTable>
      ),
    },
  ],
};

const surfacesStory: StoryDef = {
  id: "editor-surfaces",
  name: "CodeSurface and DiffSurface",
  tier: "editor",
  status: "stable",
  summary: "Scrollable code and diff blocks with a title and actions.",
  source: "src/features/dev/components/EditorSurfaces.tsx",
  importLine: IMPORT_LINE("CodeSurface, DiffSurface"),
  exports: ["CodeSurface", "DiffSurface"],
  examples: [
    { label: "Code", background: "plain", full: true, render: () => <CodeSurface title="Payload" value={'{\n  "slug": "lsd"\n}'} language="json" /> },
    { label: "Diff", background: "plain", full: true, render: () => <DiffSurface title="Changes" diffText={"- Old title\n+ New title"} /> },
    { label: "Diff with a search highlight", note: "`highlight` marks each search term inside the lines (the Change log passes its search).", background: "plain", full: true, render: () => <DiffSurface title="Changes" diffText={"- 150 mg\n+ 150 mg or more"} highlight="mg" /> },
  ],
};

function NavigationDemo() {
  const options = [
    { value: "queue", label: "Queue", icon: "lucide:inbox" as const },
    { value: "history", label: "History", icon: "lucide:history" as const },
  ];
  const [tab, setTab] = useState("queue");
  const [mode, setMode] = useState("queue");
  return (
    <div className="flex flex-col gap-3">
      <EditorNavTabs label="Views" options={options} value={tab} onChange={setTab} />
      <EditorSegmentedControl label="Mode" options={options} value={mode} onChange={setMode} />
    </div>
  );
}

const navigationStory: StoryDef = {
  id: "editor-navigation",
  name: "EditorNavTabs and EditorSegmentedControl",
  tier: "editor",
  status: "stable",
  summary: "Tabs between views of one tool, and a segmented control for a mode.",
  source: "src/features/dev/components/EditorNavigation.tsx",
  importLine: IMPORT_LINE("EditorNavTabs, EditorSegmentedControl"),
  exports: ["EditorNavTabs", "EditorSegmentedControl"],
  examples: [{ label: "Tabs and segments", render: () => <NavigationDemo /> }],
};

const tagTokenStory: StoryDef = {
  id: "editor-tag-token",
  name: "TagToken",
  tier: "editor",
  status: "stable",
  summary: "A removable token for tag and slug lists.",
  source: "src/features/dev/components/TagToken.tsx",
  importLine: IMPORT_LINE("TagToken"),
  exports: ["TagToken"],
  examples: [
    {
      label: "Variants",
      render: () => (
        <div className="flex flex-wrap gap-2">
          <TagToken label="psychedelic" />
          <TagToken label="removable" onRemove={() => undefined} removeLabel="Remove removable" />
          <TagToken label="readonly" variant="readonly" />
          <TagToken label="danger" variant="danger" />
        </div>
      ),
    },
  ],
};

function ConfirmDemo() {
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => confirm({ title: "Publish 3 changes?", description: "These go live at once.", confirmLabel: "Publish", affected: ["LSD", "Psilocybin", "Mescaline"], onConfirm: () => undefined })}
      >
        useConfirm
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          confirm({
            title: "Enable “benzo-mixing” on 2 substances?",
            description: "Readers of these articles see the banner at once.",
            confirmLabel: "Enable on 2 substances",
            affected: ["Alprazolam", "Diazepam"],
            affectedLabel: "Shows on 2 substances",
            onConfirm: () => undefined,
          })
        }
      >
        With affectedLabel
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          confirm({
            title: "Approve 2 recommendations?",
            description: "Each article is marked reviewed at the version the editor read.",
            body: (
              <ul className="theme-text-secondary list-disc space-y-1 pl-5 text-sm">
                <li>LSD, recommended by Sam: “Doses match the sources.”</li>
                <li>Ketamine, recommended by Mira.</li>
              </ul>
            ),
            confirmLabel: "Approve 2",
            onConfirm: () => Promise.reject(new Error("Writes are paused, so that was not saved.")),
          })
        }
      >
        With a body, refused
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        ConfirmDialog
      </Button>
      {dialog}
      <ConfirmDialog
        request={open ? { title: "Delete this invite?", description: "The code stops working.", confirmLabel: "Delete", destructive: true, onConfirm: () => undefined } : null}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

const confirmStory: StoryDef = {
  id: "editor-confirm-dialog",
  name: "ConfirmDialog",
  tier: "editor",
  status: "stable",
  summary: "The one confirmation for production writes; useConfirm drives it from a request object.",
  source: "src/features/dev/components/ConfirmDialog.tsx",
  importLine: IMPORT_LINE("ConfirmDialog, useConfirm"),
  exports: ["ConfirmDialog", "useConfirm"],
  examples: [{ label: "Open a confirm", render: () => <ConfirmDemo /> }],
  notes: [
    "Lint bans native confirm() in dev tools; use this instead.",
    "`affectedLabel` heads the affected list in the tool's words (\"Shows on 5 substances\") instead of \"Affects N rows\".",
    "`description` is wrapped in a p, so lists and paragraphs go in `body`. A rejected onConfirm shows its message in the dialog and relabels the button Try again.",
  ],
};

const loadErrorStory: StoryDef = {
  id: "editor-load-error-state",
  name: "LoadErrorState",
  tier: "editor",
  status: "stable",
  summary: "A failed load: what failed, the reason in plain words, a Try again button, and who to tell.",
  source: "src/features/dev/components/LoadErrorState.tsx",
  importLine: IMPORT_LINE("LoadErrorState"),
  exports: ["LoadErrorState"],
  examples: [
    { label: "Default", background: "plain", full: true, render: () => <LoadErrorState message="The editing source could not be loaded." onRetry={() => undefined} /> },
    { label: "Named, with a technical message", background: "plain", full: true, render: () => <LoadErrorState what="pending invites" message="No answer from GET /api/dev/invites (502)." onRetry={() => undefined} /> },
  ],
  notes: ["Pass `what` so the title names what failed. A message carrying an /api/ path is tucked under Details behind a plain sentence."],
};

const saveLineStory: StoryDef = {
  id: "editor-save-line",
  name: "SaveLine",
  tier: "editor",
  status: "stable",
  summary: "States where a save goes, beside the primary action, from the tool's save model, or the tool's own sentence through `copy` when no model fits.",
  source: "src/features/dev/components/SaveLine.tsx",
  importLine: IMPORT_LINE("SaveLine, SAVE_LINE_COPY, WRITE_FREEZE_COPY, saveLineCopy"),
  exports: ["SaveLine", "SAVE_LINE_COPY", "WRITE_FREEZE_COPY", "saveLineCopy"],
  examples: [
    {
      label: "Every model and destination",
      render: () => (
        <div className="flex flex-col items-start gap-2">
          {(Object.keys(SAVE_LINE_COPY) as Array<keyof typeof SAVE_LINE_COPY>).map((model) => (
            <SaveLine key={model} model={model} />
          ))}
          <SaveLine model="record" destination="proposal" />
          <SaveLine model="record" destination="read-only" />
          <p className="theme-text-faint text-xs">{saveLineCopy("batch", "live").detail}</p>
          <p className="theme-text-faint text-xs">While writes are paused every line reads: {WRITE_FREEZE_COPY.label}</p>
        </div>
      ),
    },
    {
      label: "A tool's own sentence (copy)",
      render: () => (
        <SaveLine
          model="instant"
          copy={{ label: "Saving publishes nothing.", detail: "An admin applies a playlist to a gallery in Replication Studio.", icon: "lucide:archive", tone: "info" }}
        />
      ),
    },
  ],
};

const backLinkStory: StoryDef = {
  id: "editor-back-link",
  name: "EditorBackLink",
  tier: "editor",
  status: "stable",
  summary: "The one way back from a developer utility route (UI kit, Theme lab) to the editor shell.",
  source: "src/features/dev/components/EditorBackLink.tsx",
  importLine: IMPORT_LINE("EditorBackLink"),
  exports: ["EditorBackLink"],
  examples: [{ label: "Default", render: () => <EditorBackLink /> }],
};

function WriteFreezeDemo() {
  useWriteFreezeObserver();
  const { frozen } = useWriteFreeze();
  return (
    <div className="flex flex-col items-start gap-2">
      <SaveLine model="instant" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => reportWriteFreeze()} disabled={frozen}>
          Simulate a refused write
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => clearWriteFreeze()} disabled={!frozen}>
          Simulate a write that lands
        </Button>
      </div>
      <p className="theme-text-faint text-xs">
        {`isWriteFreezeRefusal(503, { code: "${WRITE_FREEZE_CODE}" }) is ${String(isWriteFreezeRefusal(503, { code: WRITE_FREEZE_CODE }))}.`}
      </p>
    </div>
  );
}

const writeFreezeStory: StoryDef = {
  id: "editor-write-freeze",
  name: "Write freeze signal",
  tier: "editor",
  status: "stable",
  summary:
    "How the editor learns writes are paused: the shell root mounts useWriteFreezeObserver, the first 503 DATA_WRITES_FROZEN refusal flips useWriteFreeze, and every SaveLine and the frame's write status switch to WRITE_FREEZE_COPY until a write lands.",
  source: "src/features/dev/components/writeFreeze.ts",
  importLine: IMPORT_LINE("useWriteFreeze, useWriteFreezeObserver, reportWriteFreeze, clearWriteFreeze, isWriteFreezeRefusal, WRITE_FREEZE_CODE"),
  exports: ["useWriteFreeze", "useWriteFreezeObserver", "reportWriteFreeze", "clearWriteFreeze", "isWriteFreezeRefusal", "WRITE_FREEZE_CODE"],
  examples: [{ label: "Refused, then landed", render: () => <WriteFreezeDemo /> }],
};

function MergeDemo() {
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});
  return (
    <MergeConflictChoices
      conflicts={[{ path: "title", base: "LSD", mine: "Lysergide", theirs: "LSD-25" }]}
      choices={choices}
      onChoose={(path, side) => setChoices((previous) => ({ ...previous, [path]: side }))}
      label={() => "Title"}
      format={(value) => String(value ?? "(empty)")}
    />
  );
}

const mergeStory: StoryDef = {
  id: "editor-merge-conflict-choices",
  name: "MergeConflictChoices",
  tier: "editor",
  status: "stable",
  summary: "Per-field choice between your change and a colleague's newer one.",
  source: "src/features/dev/components/MergeConflictChoices.tsx",
  importLine: IMPORT_LINE("MergeConflictChoices, MERGE_CONFLICT_COPY, unresolvedConflictText"),
  exports: ["MergeConflictChoices", "MERGE_CONFLICT_COPY", "unresolvedConflictText"],
  examples: [
    { label: "One conflict", background: "plain", full: true, render: () => <MergeDemo /> },
    { label: "Copy", render: () => <p className="text-sm">{MERGE_CONFLICT_COPY.useMine} / {MERGE_CONFLICT_COPY.useTheirs}. {unresolvedConflictText(2)}</p> },
  ],
};

function UnsavedWorkDemoTool() {
  const [value, setValue] = useState("");
  const dirty = value.length > 0;
  useUnsavedWork({
    kind: "discard-only",
    because: "Finish this demo in the kit.",
    id: "kit-demo",
    label: "Kit demo draft",
    dirty,
    discard: () => setValue(""),
  });
  const registry = useUnsavedWorkRegistry();
  const { guard, dialog } = useDirtyGuard(dirty, { warnOnUnload: false });
  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type to make the draft dirty" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => registry.confirmExit(() => undefined, "leave")}>
          Leave (registry)
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => guard(() => setValue(""))}>
          Switch record (useDirtyGuard)
        </Button>
        <EditorStatusPill tone={dirty ? "warning" : "neutral"}>{registry.dirtyEntries.length} unsaved</EditorStatusPill>
      </div>
      {dialog}
    </div>
  );
}

const unsavedWorkStory: StoryDef = {
  id: "editor-unsaved-work",
  name: "Unsaved work",
  tier: "editor",
  status: "stable",
  summary:
    "The shell's unsaved-work registry (provider, report hook, registry reader) and the per-tool dirty guard.",
  source: "src/features/dev/components/unsavedWork.tsx",
  importLine: IMPORT_LINE("UnsavedWorkProvider, useUnsavedWork, useUnsavedWorkRegistry, useDirtyGuard"),
  exports: ["UnsavedWorkProvider", "useUnsavedWork", "useUnsavedWorkRegistry", "useDirtyGuard"],
  examples: [
    {
      label: "A tool reporting a draft",
      background: "plain",
      full: true,
      render: () => (
        <UnsavedWorkProvider>
          <UnsavedWorkDemoTool />
        </UnsavedWorkProvider>
      ),
    },
  ],
  notes: ["Lint bans raw beforeunload handlers in dev tools; report to the registry instead."],
};

function ShortcutList() {
  useDevShortcuts([{ keys: "j / k", label: "Next or previous item" }]);
  const list = useDevShortcutList();
  const { helpDialog } = useTriageShortcuts({ onMove: () => undefined, enabled: false });
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul>
        {list.map((shortcut) => (
          <li key={shortcut.keys}>
            <kbd>{shortcut.keys}</kbd> {shortcut.label}
          </li>
        ))}
      </ul>
      <TriageShortcutHint />
      {helpDialog}
    </div>
  );
}

function TextEntryDemo() {
  const [result, setResult] = useState("Press a key");
  const report = (event: KeyboardEvent) => setResult(isTextEntryTarget(event.target) ? "Text entry: keys pass through" : "Not text entry: shortcuts fire");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Text entry" className="w-40" placeholder="Type here" onKeyDown={report} />
      <Button type="button" size="sm" variant="outline" onKeyDown={report}>Focus me</Button>
      <EditorStatusPill tone="info">{result}</EditorStatusPill>
    </div>
  );
}

const shortcutsStory: StoryDef = {
  id: "editor-shortcuts",
  name: "Shortcuts",
  tier: "editor",
  status: "stable",
  summary:
    "The shortcut registry behind the ? sheet, the shared triage keys (j k a r s n u), and the text-entry test every key handler uses.",
  source: "src/features/dev/components/devShortcuts.tsx",
  importLine: IMPORT_LINE("DevShortcutsProvider, useDevShortcuts, useDevShortcutList, useTriageShortcuts, TriageShortcutHint, isTextEntryTarget"),
  exports: ["DevShortcutsProvider", "useDevShortcuts", "useDevShortcutList", "useTriageShortcuts", "TriageShortcutHint", "isTextEntryTarget"],
  examples: [
    {
      label: "isTextEntryTarget",
      note: "Press a key in the field and on the button.",
      render: () => <TextEntryDemo />,
    },
    {
      label: "Registered keys and the triage hint",
      background: "plain",
      full: true,
      render: () => (
        <DevShortcutsProvider>
          <ShortcutList />
        </DevShortcutsProvider>
      ),
    },
  ],
  notes: ["isTextEntryTarget(target) is true inside inputs, textareas and editable content, so single keys never fire while typing."],
};

function ScrollToDetailDemo() {
  const detail = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useScrollToDetail(detail, selected);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {DEMO_ROWS.map((row) => (
          <Button key={row.id} type="button" size="sm" variant="outline" onClick={() => setSelected(row.id)}>
            {row.name}
          </Button>
        ))}
      </div>
      <div ref={detail} className="text-sm">
        Detail: {selected ?? "none"}
      </div>
    </div>
  );
}

const scrollToDetailStory: StoryDef = {
  id: "editor-use-scroll-to-detail",
  name: "useScrollToDetail",
  tier: "editor",
  status: "stable",
  summary: "Scrolls the detail column into view when a row is picked on a stacked (narrow) layout.",
  source: "src/features/dev/components/useScrollToDetail.ts",
  importLine: IMPORT_LINE("useScrollToDetail"),
  exports: ["useScrollToDetail"],
  examples: [{ label: "Pick a row", render: () => <ScrollToDetailDemo /> }],
};

export const editorKitStories: StoryDef[] = [
  noticeStory,
  desktopOnlyNoticeStory,
  panelStory,
  sectionStory,
  fieldStory,
  selectStory,
  checkboxStory,
  toolbarStory,
  listItemStory,
  listStory,
  tableStory,
  surfacesStory,
  navigationStory,
  tagTokenStory,
  confirmStory,
  loadErrorStory,
  saveLineStory,
  writeFreezeStory,
  backLinkStory,
  mergeStory,
  unsavedWorkStory,
  shortcutsStory,
  scrollToDetailStory,
];
