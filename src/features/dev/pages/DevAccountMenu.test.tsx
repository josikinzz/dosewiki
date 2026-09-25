import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

import { accountInitials, DevAccountMenu } from "./DevAccountMenu";
import { DEV_UTILITIES, devUtilitiesFor } from "./devUtilities";

// Radix menus measure their anchor and manage pointer focus; jsdom has neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
});

function renderMenu(overrides: Partial<Parameters<typeof DevAccountMenu>[0]> = {}) {
  const props = {
    userLabel: "Journey Admin",
    userEmail: "admin@example.test",
    roleName: "Admin",
    ability: "You can edit articles.",
    utilities: DEV_UTILITIES,
    onShowShortcuts: vi.fn(),
    onOpenHref: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<DevAccountMenu {...props} />);
  const trigger = screen.getByRole("button", { name: /Signed in as Journey Admin/ });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return { props, menu: screen.getByRole("menu") };
}

describe("DevAccountMenu", () => {
  it("names the member and role on its trigger", () => {
    render(
      <DevAccountMenu userLabel="Member" roleName="Editor" ability="You can edit articles." utilities={[]} onShowShortcuts={vi.fn()} onSignOut={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Signed in as Member, Editor" })).toBeTruthy();
    expect(accountInitials("Journey Admin")).toBe("JA");
    expect(accountInitials("member@example.test")).toBe("ME");
  });

  it("links the UI kit and Theme lab through the guarded exit, and offers the keys sheet and sign out", () => {
    const { props, menu } = renderMenu();
    const kit = within(menu).getByRole("menuitem", { name: /^UI kit/ });
    expect(kit).toHaveAttribute("href", "/dev/kit");
    expect(within(menu).getByRole("menuitem", { name: /^Theme lab/ })).toHaveAttribute("href", "/dev/themes");

    fireEvent.click(kit, { button: 0 });
    expect(props.onOpenHref).toHaveBeenCalledWith("/dev/kit");

    expect(within(menu).getByRole("menuitem", { name: /Keyboard shortcuts/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    expect(within(menu).getByText("You can edit articles.", { exact: false })).toBeTruthy();
  });

  it("offers utilities only to roles that can open them", () => {
    expect(devUtilitiesFor("editor").map((utility) => utility.href)).toEqual(["/dev/kit", "/dev/themes"]);
    expect(devUtilitiesFor("contributor")).toEqual([]);
    const { menu } = renderMenu({ utilities: devUtilitiesFor("contributor") });
    expect(within(menu).queryByRole("menuitem", { name: /^UI kit/ })).toBeNull();
  });
});
