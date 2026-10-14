// @vitest-environment-options {"url":"https://approved-editor.example.test"}
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorLauncherProvider } from "./EditorLauncherProvider.editor";
import { EditorLauncherTarget } from "./EditorLauncherTarget";
import type { EditorTarget } from "./context";

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

  it("retracts forbidden actions after role changes and removes the launcher after logout", async () => {
    const view = render(<ReadingPage />);
    const user = await openTools();
    expect(screen.getByRole("menuitem", { name: "Open molecule editor" })).toHaveAttribute("href", "/dev/molecule-editor/substances/lsd");
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

  it("offers the Edit toggle only where the role can edit the page", async () => {
    const effect: EditorTarget = { kind: "effect", slug: "drifting", name: "Drifting" };
    auth.role = "editor";
    const view = render(<ReadingPage target={effect} />);
    await screen.findByRole("button", { name: "Open dev tools" });
    // Effect articles are admin-only; an editor gets no toggle there.
    expect(screen.queryByRole("button", { name: "Edit page" })).not.toBeInTheDocument();

    view.rerender(<ReadingPage />);
    expect(await screen.findByRole("button", { name: "Edit page" })).toBeInTheDocument();

    // Substance articles need the editor role, so a contributor sees none.
    auth.role = "contributor";
    view.rerender(<ReadingPage />);
    expect(screen.queryByRole("button", { name: "Edit page" })).not.toBeInTheDocument();

    auth.role = "admin";
    view.rerender(<ReadingPage target={effect} />);
    expect(await screen.findByRole("button", { name: "Edit page" })).toBeInTheDocument();
  });
});
