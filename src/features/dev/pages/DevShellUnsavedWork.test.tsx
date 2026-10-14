/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock("./useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import { UnsavedWorkProvider, useUnsavedWork } from "../components/unsavedWork";
import { createDraftRecoveryStore, recoveryActorKey } from "../recovery/draftRecovery";
import { DevModePageChrome } from "./DevModePageChrome";
import type { DevModeTab } from "./devTabRegistry";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** A stand-in tool: one text field whose draft registers with the shell. */
function FakeWritingTool({ save, publishesLive }: { save?: () => Promise<void>; publishesLive?: boolean }) {
  const [draft, setDraft] = useState("");
  useUnsavedWork({
    id: "writing",
    label: "Writing: Harm reduction basics",
    dirty: draft !== "",
    save: save ? async () => {
      await save();
      setDraft("");
    } : undefined,
    discard: () => setDraft(""),
    publishesLive,
  });
  return <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
}

function renderShell({ save, publishesLive }: { save?: () => Promise<void>; publishesLive?: boolean } = {}) {
  const onLeave = vi.fn();
  render(
    <UnsavedWorkProvider>
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab={"writing" as DevModeTab}
        isSignedIn
        role="editor"
        sessionStatus="authenticated"
        userEmail="member@example.test"
        userName="Member"
        onPrimaryTabChange={vi.fn()}
        onTabChange={vi.fn()}
        onSignIn={vi.fn()}
        onLeave={onLeave}
      />
      <FakeWritingTool save={save} publishesLive={publishesLive} />
    </UnsavedWorkProvider>,
  );
  return { onLeave };
}

function makeDirty() {
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "New intro" } });
}

/** Sign out lives in the rail's account menu; Radix menus open on pointerdown. */
function openAccountMenuItem(name: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: /^Signed in as / }), { button: 0, ctrlKey: false });
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name }));
}

describe("the shell's unsaved-work registry", () => {
  it("never offers Save for work whose save would go live, even when the tool passes one", () => {
    const save = vi.fn(async () => {});
    const { onLeave } = renderShell({ save, publishesLive: true });
    makeDirty();

    fireEvent.click(screen.getAllByRole("button", { name: "Leave editor" })[0]);
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText(/Publish it from the tool; leaving here never publishes\./)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(save).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("clears this browser's draft recovery copies on sign-out", () => {
    const store = createDraftRecoveryStore(recoveryActorKey("admin@example.com")!);
    store.write({ tool: "writing", record: "row:field-notes", baseline: "a", draft: { title: "Mine" } });
    renderShell();
    signOutMock.mockClear();

    openAccountMenuItem("Sign out");
    // With nothing unsaved, sign-out still asks once: the recovery copies go too.
    expect(signOutMock).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Sign out of the editor?" })).getByRole("button", { name: "Sign out" }));

    expect(signOutMock).toHaveBeenCalled();
    expect(store.read("writing", "row:field-notes")).toBeNull();
  });
});
