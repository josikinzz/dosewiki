import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppearanceTogglePill } from "./AppearanceTogglePill";

const OPTIONS = [
  { value: "dark", label: "Dark", icon: <span aria-hidden="true">D</span> },
  { value: "light", label: "Light", icon: <span aria-hidden="true">L</span> },
] as const;

function Harness() {
  const [value, setValue] = useState<"dark" | "light">("dark");
  return (
    <AppearanceTogglePill<"dark" | "light">
      axis="color-scheme"
      label="Darkness"
      value={value}
      options={OPTIONS}
      onChange={setValue}
    />
  );
}

describe("AppearanceTogglePill", () => {
  it("names the setting and exposes both stable values as radios", () => {
    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Darkness" });
    expect(group).toHaveAttribute("data-appearance-axis", "color-scheme");
    expect(group).toHaveAttribute("data-appearance-value", "dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("selects a named value without action-oriented pressed-state ambiguity", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Light" }));

    expect(screen.getByRole("radiogroup", { name: "Darkness" })).toHaveAttribute(
      "data-appearance-value",
      "light",
    );
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });

  it("flips when either the checked or unchecked half is activated", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dark = screen.getByRole("radio", { name: "Dark" });
    const light = screen.getByRole("radio", { name: "Light" });

    await user.click(dark);
    expect(light).toHaveAttribute("aria-checked", "true");

    await user.click(light);
    expect(dark).toHaveAttribute("aria-checked", "true");

    dark.focus();
    await user.keyboard("{Enter}");
    expect(light).toHaveAttribute("aria-checked", "true");
  });

  it("follows the radio arrow-key pattern", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dark = screen.getByRole("radio", { name: "Dark" });
    dark.focus();
    await user.keyboard("{ArrowRight}");

    const light = screen.getByRole("radio", { name: "Light" });
    expect(light).toHaveFocus();
    expect(light).toHaveAttribute("aria-checked", "true");
  });
});
