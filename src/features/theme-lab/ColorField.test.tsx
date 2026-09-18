import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorField } from "./ColorField";

describe("ColorField", () => {
  it("preserves current alpha when a six-digit hex is entered", () => {
    const onChange = vi.fn();
    render(<ColorField initial={{ r: 255, g: 255, b: 255, a: 0.1 }} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#445566" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ r: 68, g: 85, b: 102, a: 0.1 });
  });

  it("applies alpha when an eight-digit hex is entered", () => {
    const onChange = vi.fn();
    render(<ColorField initial={{ r: 255, g: 255, b: 255, a: 0.1 }} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Hex/ }), {
      target: { value: "#44556680" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ r: 68, g: 85, b: 102, a: 0.502 });
  });
});
