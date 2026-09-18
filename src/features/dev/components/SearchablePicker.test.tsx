import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";

// cmdk scrolls the active item into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

import { SearchableMultiPicker, SearchablePicker } from "./SearchablePicker";

const OPTIONS = Array.from({ length: 2200 }, (_, index) => ({
  value: `person-${index}`,
  label: `Person ${index}`,
  hint: `@handle${index}`,
}));

function SingleHarness({ onChange }: { onChange: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <SearchablePicker
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      placeholder="Choose a person"
      emptyText="No one matches."
      ariaLabel="Author"
    />
  );
}

function MultiHarness({ onChange }: { onChange: (values: string[]) => void }) {
  const [value, setValue] = useState<string[]>(["person-1"]);
  return (
    <SearchableMultiPicker
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      placeholder="Add a person"
      emptyText="No one matches."
      ariaLabel="Authors"
    />
  );
}

describe("SearchablePicker", () => {
  it("caps the mounted matches, filters on typing, and reports the pick", async () => {
    const onChange = vi.fn();
    render(<SingleHarness onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Author" }));
    const search = await screen.findByPlaceholderText("Choose a person");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(50);
    expect(screen.getByText(/more matches/)).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Person 217" } });
    const names = screen.getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual([
      "Person 217@handle217",
      "Person 2170@handle2170",
      "Person 2171@handle2171",
      "Person 2172@handle2172",
      "Person 2173@handle2173",
      "Person 2174@handle2174",
      "Person 2175@handle2175",
      "Person 2176@handle2176",
      "Person 2177@handle2177",
      "Person 2178@handle2178",
      "Person 2179@handle2179",
    ]);

    fireEvent.click(screen.getByRole("option", { name: /^Person 2173/ }));
    expect(onChange).toHaveBeenLastCalledWith("person-2173");
    expect(screen.getByRole("combobox", { name: "Author" })).toHaveTextContent("Person 2173");

    fireEvent.click(screen.getByRole("combobox", { name: "Author" }));
    fireEvent.click(await screen.findByRole("option", { name: "Clear selection" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows the empty text when nothing matches", async () => {
    render(<SingleHarness onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Author" }));
    fireEvent.change(await screen.findByPlaceholderText("Choose a person"), { target: { value: "zzz" } });
    expect(screen.getByText("No one matches.")).toBeInTheDocument();
  });
});

describe("SearchableMultiPicker", () => {
  it("renders chosen values as removable chips and adds picks without repeating them", async () => {
    const onChange = vi.fn();
    render(<MultiHarness onChange={onChange} />);

    const chips = screen.getByRole("list", { name: "Authors, selected" });
    expect(within(chips).getByText("Person 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Authors" }));
    fireEvent.change(await screen.findByPlaceholderText("Add a person"), { target: { value: "Person 1" } });
    expect(screen.queryByRole("option", { name: /^Person 1@/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /^Person 10@/ }));
    expect(onChange).toHaveBeenLastCalledWith(["person-1", "person-10"]);

    fireEvent.click(within(chips).getByRole("button", { name: "Remove Person 1" }));
    expect(onChange).toHaveBeenLastCalledWith(["person-10"]);
  });
});
