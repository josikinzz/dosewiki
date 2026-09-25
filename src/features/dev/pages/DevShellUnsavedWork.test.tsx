/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock("./useDevRailBadges", () => ({ useDevRailBadges: () => ({}) }));

import { UnsavedWorkProvider, useUnsavedWork } from "../components/unsavedWork";
import { DevModePageChrome } from "./DevModePageChrome";
import type { DevModeTab } from "./devTabRegistry";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** A stand-in tool: one text field whose draft registers with the shell. */
function FakeWritingTool({ save }: { save?: () => Promise<void> }) {
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
  });
  return <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
}

function renderShell({ save }: { save?: () => Promise<void> } = {}) {
  const onTabChange = vi.fn();
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
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
        onLeave={onLeave}
      />
      <FakeWritingTool save={save} />
    </UnsavedWorkProvider>,
  );
  const nav = screen.getByRole("navigation", { name: "Dev mode tools" });
  return { onTabChange, onLeave, nav };
}

function makeDirty() {
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "New intro" } });
}

describe("the shell's unsaved-work registry", () => {
  it("asks before a rail click drops a dirty draft, and Discard clears it and moves on", () => {
    const { onTabChange, nav } = renderShell();
    makeDirty();

    fireEvent.click(within(nav).getByRole("button", { name: /^Substances/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Writing: Harm reduction basics")).toBeTruthy();
    expect(onTabChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));

    expect(onTabChange).toHaveBeenCalledWith("articles");
    expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("");
  });

  it("stays put when the editor cancels", () => {
    const { onTabChange, nav } = renderShell();
    makeDirty();

    fireEvent.click(within(nav).getByRole("button", { name: /^Substances/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep editing" }));

    expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Draft" })).toHaveValue("New intro");
  });

  it("switches without a dialog when nothing is dirty", () => {
    const { onTabChange, nav } = renderShell();

    fireEvent.click(within(nav).getByRole("button", { name: /^Substances/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onTabChange).toHaveBeenCalledWith("articles");
  });

  it("runs the tool's save on Leave and leaves only once it succeeds", async () => {
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new Error("The server is unreachable.");
    });
    const { onLeave } = renderShell({ save });
    makeDirty();

    fireEvent.click(screen.getAllByRole("button", { name: "Leave editor" })[0]);
    const dialog = screen.getByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The server is unreachable.");
    expect(onLeave).not.toHaveBeenCalled();

    fail = false;
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
  });

  it("asks before signing out with a dirty draft", () => {
    renderShell();
    makeDirty();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(signOutMock).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("holds the browser tab open on unload while an entry is dirty", () => {
    renderShell();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    makeDirty();
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("marks the dirty tab in the rail with a name that says so", () => {
    const { nav } = renderShell();
    expect(within(nav).getByRole("button", { name: "Site" })).toBeTruthy();

    makeDirty();

    // Writing sits in the Site menu for an editor: the menu says so, and so
    // does the tab inside it.
    const trigger = within(nav).getByRole("button", { name: "Site, unsaved changes" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Writing, unsaved changes" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Copy" })).toBeTruthy();
  });

  it("never leaves the editor when Escape is pressed on a button", () => {
    const { onLeave, onTabChange, nav } = renderShell();
    const button = within(nav).getByRole("button", { name: /^Substances/ });
    button.focus();

    fireEvent.keyDown(button, { key: "Escape" });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onLeave).not.toHaveBeenCalled();
    expect(onTabChange).not.toHaveBeenCalled();
  });
});
