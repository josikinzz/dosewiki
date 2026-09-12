// @vitest-environment-options {"url":"https://approved-editor.example.test"}
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorLauncherProvider } from "./EditorLauncherProvider.editor";
import { EditorLauncherTarget } from "./EditorLauncherTarget";
import type { EditorTarget } from "./context";
import { useContextualEditing } from "@/features/contextual-editing/context";

const auth = vi.hoisted(() => ({
  pathname: "/lsd",
  status: "authenticated",
  role: "admin",
  flavor: "dosewiki",
}));
vi.mock("next/navigation", () => ({ usePathname: () => auth.pathname }));
vi.mock("@/config/siteFlavor", () => ({ get SITE_FLAVOR() { return auth.flavor; } }));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ status: auth.status, data: { user: { role: auth.role } } }),
}));

const substance: EditorTarget = { kind: "substance", slug: "lsd", name: "LSD" };
function ReadingPage({ target = substance, overlay }: { target?: EditorTarget; overlay?: EditorTarget }) {
  return <EditorLauncherProvider>
    <EditorLauncherTarget target={target} />
    {overlay ? <EditorLauncherTarget target={overlay} priority="overlay" /> : null}
  </EditorLauncherProvider>;
}
function PrivateDraft() {
  const { mode, setDirty } = useContextualEditing();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDirty("fixture-draft", draft !== "");
    return () => setDirty("fixture-draft", false);
  }, [draft, setDirty]);
  return mode === "edit" ? <input aria-label="Private draft" value={draft} onChange={(event) => setDraft(event.target.value)} /> : <p>Public reading</p>;
}
function ShortcutFixture() {
  const { mode } = useContextualEditing();
  return <>
    <output aria-label="Editing mode">{mode}</output>
    <input aria-label="Shortcut input" />
    <textarea aria-label="Shortcut textarea" />
    <select aria-label="Shortcut select" defaultValue="">
      <option value="">Choose</option>
      <option value="e">E</option>
    </select>
    <div role="textbox" aria-label="Shortcut contenteditable" contentEditable suppressContentEditableWarning />
  </>;
}
async function openTools() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open dev tools" }));
  return user;
}

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_EDITOR_BUILD", "true");
  auth.pathname = "/lsd";
  auth.status = "authenticated";
  auth.role = "admin";
  auth.flavor = "dosewiki";
});

describe("reading-page editor navigation", () => {
  it("does not expose DoseWiki editing on Effect Index, even on an editor host", async () => {
    const dosewiki = render(<ReadingPage />);
    await screen.findByRole("button", { name: "Open dev tools" });
    dosewiki.unmount();
    auth.flavor = "effectindex";
    await act(async () => { render(<ReadingPage />); });
    expect(screen.queryByRole("button", { name: "Open dev tools" })).not.toBeInTheDocument();
  });

  it("drops outgoing record links before replacement content arrives, then selects the new record", async () => {
    const view = render(<ReadingPage />);
    await openTools();
    expect(screen.getByRole("menuitem", { name: "Open article editor" })).toHaveAttribute("href", "/dev/articles/lsd");
    auth.pathname = "/about";
    view.rerender(<ReadingPage />);
    await openTools();
    expect(screen.queryByRole("menuitem", { name: "Open article editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "All dev tools" })).toHaveAttribute("href", "/dev");
    view.rerender(<ReadingPage target={{ kind: "writing", slug: "about", name: "About", writingKind: "article" }} />);
    const user = await openTools();
    expect(screen.getByRole("menuitem", { name: "Open page editor" })).toHaveAttribute("href", "/dev/about");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open dev tools" })).toHaveFocus();
  });

  it("masks underlying article actions for unsupported galleries and follows supported viewer addresses", async () => {
    const view = render(<ReadingPage overlay={{ kind: "generic", name: "Artist gallery" }} />);
    await openTools();
    expect(screen.queryByRole("menuitem", { name: "Open article editor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Open replication editor" })).not.toBeInTheDocument();
    const gallery: EditorTarget = { kind: "replications", slug: "lsd", name: "LSD" };
    view.rerender(<ReadingPage overlay={gallery} />);
    await openTools();
    expect(screen.getByRole("menuitem", { name: "Open replication editor" })).toHaveAttribute("href", "/dev/replications/lsd");
    auth.pathname = "/replications/viewer/another-work";
    view.rerender(<ReadingPage overlay={gallery} />);
    const user = await openTools();
    expect(screen.getByRole("menuitem", { name: "Open replication editor" })).toHaveAttribute("href", "/dev/replications/lsd");
    await user.keyboard("{Escape}");
    auth.pathname = "/lsd";
    view.rerender(<ReadingPage />);
    await openTools();
    expect(screen.getByRole("menuitem", { name: "Open article editor" })).toHaveAttribute("href", "/dev/articles/lsd");
  });

  it("retracts forbidden actions after role changes and removes the launcher after logout", async () => {
    const view = render(<ReadingPage />);
    const user = await openTools();
    expect(screen.getByRole("menuitem", { name: "Open molecule editor" })).toHaveAttribute("href", "/dev/molecule-editor/lsd");
    expect(screen.getByRole("menuitem", { name: "Review citations" })).toHaveAttribute("href", "/dev/citation-review/lsd");
    auth.role = "editor";
    view.rerender(<ReadingPage />);
    expect(screen.getByRole("menuitem", { name: "Open article editor" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Open molecule editor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Review citations" })).not.toBeInTheDocument();
    auth.role = "contributor";
    view.rerender(<ReadingPage />);
    expect(screen.queryByRole("menuitem", { name: "Open article editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "All dev tools" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    auth.status = "unauthenticated";
    await act(async () => view.rerender(<ReadingPage />));
    expect(screen.queryByRole("button", { name: "Open dev tools" })).not.toBeInTheDocument();
  });


  it("toggles contextual editing with E while leaving typing and modified keys alone", async () => {
    const view = render(<EditorLauncherProvider><ShortcutFixture /></EditorLauncherProvider>);
    const user = userEvent.setup();
    const mode = screen.getByRole("status", { name: "Editing mode" });
    const editButton = await screen.findByRole("button", { name: "Edit page" });
    expect(editButton).toHaveAttribute("title", expect.stringContaining("Press E to toggle editing"));

    await user.keyboard("e");
    expect(mode).toHaveTextContent("edit");
    await user.keyboard("E");
    expect(mode).toHaveTextContent("view");

    const input = screen.getByRole("textbox", { name: "Shortcut input" });
    await user.click(input);
    await user.keyboard("e");
    expect(input).toHaveValue("e");
    expect(mode).toHaveTextContent("view");

    const textarea = screen.getByRole("textbox", { name: "Shortcut textarea" });
    await user.click(textarea);
    await user.keyboard("E");
    expect(textarea).toHaveValue("E");
    expect(mode).toHaveTextContent("view");

    const editable = screen.getByRole("textbox", { name: "Shortcut contenteditable" });
    await user.click(editable);
    await user.keyboard("e");
    expect(mode).toHaveTextContent("view");

    await user.click(screen.getByRole("combobox", { name: "Shortcut select" }));
    await user.keyboard("e");
    expect(mode).toHaveTextContent("view");

    await user.click(document.body);
    await user.keyboard("{Meta>}e{/Meta}{Control>}e{/Control}{Alt>}e{/Alt}");
    expect(mode).toHaveTextContent("view");
    const prevented = new KeyboardEvent("keydown", { key: "e", bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.dispatchEvent(prevented);
    expect(mode).toHaveTextContent("view");

    auth.role = "viewer";
    view.rerender(<EditorLauncherProvider><ShortcutFixture /></EditorLauncherProvider>);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit page" })).not.toBeInTheDocument());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
    expect(mode).toHaveTextContent("view");
  });
  it("returns to a retained draft after sign-in without treating entry as destructive navigation", async () => {
    const page = <EditorLauncherProvider><PrivateDraft /></EditorLauncherProvider>;
    const view = render(page);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit page" }));
    await user.type(screen.getByRole("textbox", { name: "Private draft" }), "Retained correction");
    auth.status = "unauthenticated";
    view.rerender(<EditorLauncherProvider><PrivateDraft /></EditorLauncherProvider>);
    expect(screen.queryByRole("textbox", { name: "Private draft" })).not.toBeInTheDocument();
    auth.status = "authenticated";
    view.rerender(<EditorLauncherProvider><PrivateDraft /></EditorLauncherProvider>);
    await user.click(await screen.findByRole("button", { name: "Edit page" }));
    expect(screen.getByRole("textbox", { name: "Private draft" })).toHaveValue("Retained correction");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
  });

  it("disables contextual controls without removing existing workbench navigation", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTEXTUAL_EDITING", "false");
    render(<ReadingPage />);
    await openTools();
    expect(screen.queryByRole("button", { name: "Edit page" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open article editor" })).toHaveAttribute("href", "/dev/articles/lsd");
  });
});
