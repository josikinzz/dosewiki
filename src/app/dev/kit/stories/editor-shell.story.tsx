"use client";

import { Button } from "@/components/ui/button";
import { CountBadge, ToolLabel, ToolMarks } from "@/features/dev/pages/DevModeToolRail";
import { DevWorkingChangesPanel } from "@/features/dev/pages/DevWorkingChangesPanel";
import type { DevCommitControls } from "@/features/dev/pages/useDevModeSaveActions";

import type { StoryDef } from "../registry/types";

/*
 * Shell pieces the redesign passes share that live beside the shell rather
 * than in the editor kit index (src/features/dev/pages). They document no
 * barrel export, so `exports` stays empty; the completeness gate covers the
 * index, and these are here so a builder finds them before building another.
 */

function commitControls(overrides: Partial<DevCommitControls> = {}): DevCommitControls {
  return {
    destination: "production",
    notice: null,
    dismissNotice: () => undefined,
    rebase: null,
    isSaving: false,
    hasPendingChanges: true,
    blockedReason: null,
    canCommit: true,
    requestCommit: () => undefined,
    scope: [],
    health: null,
    dialog: null,
    ...overrides,
  };
}

const CHANGES = (
  <ul className="theme-text-secondary space-y-1 text-sm">
    <li>Benzos, renamed from “Benzodiazepines”, on 2 articles</li>
    <li>Stimulant, merged into “Stimulants”</li>
  </ul>
);

const workingChangesStory: StoryDef = {
  id: "editor-working-changes-panel",
  name: "DevWorkingChangesPanel",
  tier: "editor",
  status: "stable",
  summary:
    "A batch tool's one Working changes panel: the state in one sentence, the commit button with the save key, why a commit waits, the receipt, what changed in the tool's words and the diff folded shut.",
  source: "src/features/dev/pages/DevWorkingChangesPanel.tsx",
  importLine: 'import { DevWorkingChangesPanel } from "@/features/dev/pages/DevWorkingChangesPanel";',
  exports: [],
  examples: [
    {
      label: "Changes waiting",
      background: "plain",
      full: true,
      render: () => (
        <DevWorkingChangesPanel
          commit={commitControls()}
          id="kit-working-changes"
          pendingSummary="2 articles changed, not live yet."
          idleSummary="Tag changes collect here until you commit them."
          changes={CHANGES}
          saveKeyLabel="⌘S"
          onCommit={() => undefined}
        />
      ),
    },
    {
      label: "A commit that waits, with the reason",
      background: "plain",
      full: true,
      render: () => (
        <DevWorkingChangesPanel
          commit={commitControls({ canCommit: false, blockedReason: "The server cannot write right now, so the commit waits." })}
          id="kit-working-changes-blocked"
          pendingSummary="The Psychoactive layout changed, not live yet."
          idleSummary="Layout changes collect here until you commit them."
          saveKeyLabel="⌘S"
          onCommit={() => undefined}
        />
      ),
    },
    {
      label: "Nothing waiting",
      background: "plain",
      full: true,
      render: () => (
        <DevWorkingChangesPanel
          commit={commitControls({ hasPendingChanges: false, canCommit: false })}
          id="kit-working-changes-idle"
          pendingSummary=""
          idleSummary="Tag changes collect here until you commit them."
          saveKeyLabel="⌘S"
          onCommit={() => undefined}
        />
      ),
    },
  ],
  whenToUse: ["A tool whose edits collect for one commit (Tags, Index layout). Get the controls from `useDevModeSaveActions().commitControls`."],
  notes: [
    "Never repeat the frame's batch sentence; say what changed in the tool's own terms and pass the same lines to `requestCommit(lead)`.",
    "`describeFailure` rewords a refusal the tool understands and offers its way forward (\"Load the latest layout\").",
  ],
};

const countBadgeStory: StoryDef = {
  id: "editor-count-badge",
  name: "CountBadge, ToolLabel, ToolMarks",
  tier: "editor",
  status: "stable",
  summary:
    "Work waiting on a tool: the label and its spoken suffix are one text run, the dot and the badge are silent. A stale count is hollow; a sum with a part that never loaded is a floor.",
  source: "src/features/dev/pages/DevModeToolRail.tsx",
  importLine: 'import { CountBadge, ToolLabel, ToolMarks } from "@/features/dev/pages/DevModeToolRail";',
  exports: [],
  examples: [
    {
      label: "Loaded, stale and a floor",
      note: "Stale: the latest refresh failed, the number is the last known. atLeast: one of the summed counts never loaded, so the rail says \"13+\" and Home says \"At least 13\".",
      render: () => (
        <div className="flex flex-wrap items-center gap-3">
          <CountBadge count={4} />
          <CountBadge count={4} stale />
          <CountBadge count={13} atLeast />
        </div>
      ),
    },
    {
      label: "On a control",
      render: () => (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm">
            <ToolLabel label="Inbox" badge={13} atLeast />
            <ToolMarks badge={13} atLeast />
          </Button>
          <Button type="button" variant="outline" size="sm">
            <ToolLabel label="Writing" unsaved />
            <ToolMarks unsaved />
          </Button>
        </div>
      ),
    },
  ],
};

export const editorShellStories: StoryDef[] = [workingChangesStory, countBadgeStory];
