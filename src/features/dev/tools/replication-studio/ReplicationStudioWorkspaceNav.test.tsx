import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ReplicationStudioWorkspaceNav } from "./ReplicationStudioWorkspaceNav";

function renderNav() {
  return render(
    <ReplicationStudioWorkspaceNav
      activePanel="featured"
      rowCount={3}
      artistCount={2}
      effectCount={1}
      busy={false}
      fileInputRef={createRef<HTMLInputElement>()}
      onRequestWorkspace={vi.fn()}
      onReload={vi.fn()}
      onUpload={vi.fn()}
      onFiles={vi.fn()}
    />,
  );
}

/** True when a class list hides the element visually at some breakpoint. */
function visuallyHidden(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (/(^|\s)([a-z-]+:)*(sr-only|hidden)(\s|$)/.test(node.className)) return true;
  }
  return false;
}

describe("ReplicationStudioWorkspaceNav", () => {
  it("names every workspace in visible text at every width, with no hover tooltip", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Replication Studio workspace" });

    for (const name of ["Library", "Playlists", "Showcases", "Featured"]) {
      const button = within(nav).getByRole("button", { name });
      expect(visuallyHidden(within(button).getByText(name))).toBe(false);
      expect(button).not.toHaveAttribute("title");
    }
    expect(within(nav).getByRole("button", { name: "Featured" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("scrolls the workspace row sideways instead of dropping labels on a narrow screen", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Replication Studio workspace" });

    expect(nav.className).toMatch(/overflow-x-auto/);
  });
});
