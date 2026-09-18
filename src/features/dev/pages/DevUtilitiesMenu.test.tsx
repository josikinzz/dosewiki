import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

import { DevUtilitiesMenu } from "./DevUtilitiesMenu";

// Radix popovers measure their anchor and manage pointer focus; jsdom has neither.
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

describe("DevUtilitiesMenu", () => {
  it("opens from a wrench button and links to the UI kit and Theme lab", async () => {
    const user = userEvent.setup();
    render(<DevUtilitiesMenu />);

    const trigger = screen.getByRole("button", { name: "Utilities" });
    expect(trigger.querySelector("[data-icon='lucide:wrench']")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);

    const menu = screen.getByRole("dialog", { name: "Utilities" });
    expect(within(menu).getByRole("link", { name: /^UI kit/ })).toHaveAttribute("href", "/dev/kit");
    expect(within(menu).getByRole("link", { name: /^Theme lab/ })).toHaveAttribute(
      "href",
      "/dev/themes",
    );
    expect(within(menu).getAllByRole("link")).toHaveLength(2);
  });
});
