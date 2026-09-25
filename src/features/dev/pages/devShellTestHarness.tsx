import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, vi } from "vitest";

import { UnsavedWorkProvider } from "../components/unsavedWork";
import type { AppRole } from "@/lib/auth/roles";
import { DevModePageChrome } from "./DevModePageChrome";
import type { DevModeTab } from "./devTabRegistry";

/**
 * Renders one real tool under the /dev shell chrome and its unsaved-work
 * registry, the way DevModePageView mounts it. The caller's test file mocks
 * `next-auth/react`, the Icon and `./useDevRailBadges` (vi.mock only applies
 * in the file that calls it).
 */
export function renderInDevShell(tool: ReactElement, { tab, role = "admin" }: { tab: DevModeTab; role?: AppRole }) {
  const onTabChange = vi.fn();
  const onLeave = vi.fn();
  render(
    <UnsavedWorkProvider>
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab={tab}
        isSignedIn
        role={role}
        sessionStatus="authenticated"
        userEmail="admin@example.com"
        userName="Admin"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
        onLeave={onLeave}
      />
      {tool}
    </UnsavedWorkProvider>,
  );
  const nav = screen.getByRole("navigation", { name: "Dev mode tools" });
  return { onTabChange, onLeave, nav };
}

/**
 * The rail names the tab that holds unsaved work: on the tab itself when the
 * rail shows it, and on the group menu and its item when the tab is folded
 * into a menu.
 */
export function expectRailMarksUnsaved(nav: HTMLElement, tabLabel: string) {
  const name = `${tabLabel}, unsaved changes`;
  if (within(nav).queryByRole("button", { name })) return;
  const trigger = within(nav).getByRole("button", { name: /, unsaved changes$/ });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  const menu = screen.getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name })).toBeTruthy();
  fireEvent.keyDown(menu, { key: "Escape" });
}

/**
 * Clicks another rail tab and returns the shell's dialog. The switch must not
 * have happened yet.
 */
export function switchTabExpectingGuard(nav: HTMLElement, onTabChange: ReturnType<typeof vi.fn>) {
  fireEvent.click(within(nav).getByRole("button", { name: /^Substances/ }));
  expect(onTabChange).not.toHaveBeenCalled();
  return screen.getByRole("dialog", { name: /Save or discard/ });
}
