import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearWriteFreeze, reportWriteFreeze } from "../components/writeFreeze";
import { DevWorkingChangesPanel } from "./DevWorkingChangesPanel";
import type { DevCommitControls } from "./useDevModeSaveActions";

function controls(overrides: Partial<DevCommitControls> = {}): DevCommitControls {
  return {
    destination: "production",
    notice: null,
    dismissNotice: vi.fn(),
    rebase: null,
    isSaving: false,
    hasPendingChanges: true,
    blockedReason: null,
    canCommit: true,
    requestCommit: vi.fn(),
    scope: [],
    health: null,
    dialog: null,
    ...overrides,
  };
}

function renderPanel(commit: DevCommitControls, describeFailure?: Parameters<typeof DevWorkingChangesPanel>[0]["describeFailure"]) {
  const onCommit = vi.fn();
  render(
    <DevWorkingChangesPanel
      commit={commit}
      id="panel"
      pendingSummary="The Psychoactive class layout changed, not live yet."
      idleSummary="Nothing waiting to commit."
      describeFailure={describeFailure}
      saveKeyLabel="⌘S"
      onCommit={onCommit}
    />,
  );
  return { onCommit };
}

describe("DevWorkingChangesPanel", () => {
  afterEach(() => {
    act(() => clearWriteFreeze());
  });

  it("says what waits and commits from the accent button", () => {
    const { onCommit } = renderPanel(controls());
    expect(screen.getByText("The Psychoactive class layout changed, not live yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Commit to production/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the button off and says why a commit waits", () => {
    renderPanel(controls({ canCommit: false, blockedReason: "The server cannot write to the database right now (issue)." }));
    expect(screen.getByRole("button", { name: /^Commit to production/ })).toBeDisabled();
    expect(screen.getByText(/Commit waits: The server cannot write/)).toBeInTheDocument();
  });

  it("lets the tool reword a failure it understands and offer its way forward", () => {
    const loadLatest = vi.fn();
    renderPanel(
      controls({ notice: { type: "error", message: "Published content changed since you opened this editor. (code=EDIT_CONFLICT)" } }),
      (message) => (message.includes("EDIT_CONFLICT")
        ? { message: "Someone published a newer layout.", actions: <button type="button" onClick={loadLatest}>Load the latest layout</button> }
        : null),
    );
    expect(screen.getByText("Someone published a newer layout.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load the latest layout" }));
    expect(loadLatest).toHaveBeenCalled();
  });

  it("reads a failed commit under the freeze as the freeze", () => {
    act(() => reportWriteFreeze());
    renderPanel(controls({ notice: { type: "error", message: "Service unavailable." } }), () => ({ message: "not this" }));
    expect(screen.getByText("Writes are paused, so your changes were not committed. They stay in your working changes.")).toBeInTheDocument();
  });
});
