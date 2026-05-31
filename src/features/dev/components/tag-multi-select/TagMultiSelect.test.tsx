import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TagOption } from "@/data/config/tagOptions";
import { TagMultiSelect } from "./TagMultiSelect";

const options: TagOption[] = [
  { label: "Alpha", value: "alpha", count: 1 },
  { label: "Beta", value: "beta", count: 2 },
  { label: "Gamma", value: "gamma", count: 3 },
];

describe("TagMultiSelect", () => {
  it("filters options and adds a selected option from the menu", async () => {
    const onChange = vi.fn();

    render(<TagMultiSelect label="Tags" value={[]} options={options} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: /tags/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "be" } });

    const option = await screen.findByRole("option", { name: /beta/i });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(["Beta"]);
  });

  it("creates a normalized tag label when enter is pressed for a new value", async () => {
    const onChange = vi.fn();

    render(<TagMultiSelect label="Tags" value={[]} options={options} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: /tags/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "custom tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["Custom Tag"]);
    });
  });

  it("removes the last selected tag when backspace is pressed on an empty query", async () => {
    const onChange = vi.fn();

    render(<TagMultiSelect label="Tags" value={["Alpha", "Beta"]} options={options} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: /tags/i });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["Alpha"]);
    });
  });
});
