import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { EditorList } from "./EditorList";
import { EditorListItem } from "./EditorListItem";

const ITEMS = Array.from({ length: 1000 }, (_, index) => ({ slug: `item-${index}`, name: `Item ${index}` }));

function Harness({ onSelect, search = false }: { onSelect?: (key: string) => void; search?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <EditorList
      items={ITEMS}
      getKey={(item) => item.slug}
      renderItem={(item, { selected: active }) => <EditorListItem active={active} title={item.name} />}
      selectedKey={selected}
      onSelect={(key) => {
        onSelect?.(key);
        setSelected(key);
      }}
      search={search ? { placeholder: "Search items", matches: (item, query) => item.name.includes(query) } : undefined}
      emptyText="No items match."
      label="Items"
    />
  );
}

describe("EditorList", () => {
  it("mounts only a window of rows for a thousand items", () => {
    render(<Harness />);
    const listbox = screen.getByRole("listbox", { name: "Items" });
    const options = within(listbox).getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(ITEMS.length);
    expect(options[0]).toHaveTextContent("Item 0");
  });

  it("moves the selection with the arrow keys and reports each key", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const listbox = screen.getByRole("listbox", { name: "Items" });

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("item-0");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("item-1");
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(onSelect).toHaveBeenLastCalledWith("item-0");
    fireEvent.keyDown(listbox, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("item-999");

    expect(within(listbox).getByRole("option", { selected: true })).toHaveTextContent("Item 999");
    expect(listbox).toHaveAttribute("aria-activedescendant", within(listbox).getByRole("option", { selected: true }).id);
  });

  it("selects on click and filters through the search box", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} search />);
    const listbox = screen.getByRole("listbox", { name: "Items" });

    fireEvent.click(within(listbox).getByRole("option", { name: "Item 3" }));
    expect(onSelect).toHaveBeenCalledWith("item-3");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "Item 99" } });
    const names = within(listbox).getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual(["Item 99", "Item 990", "Item 991", "Item 992", "Item 993", "Item 994", "Item 995", "Item 996", "Item 997", "Item 998", "Item 999"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), { target: { value: "nothing" } });
    expect(within(listbox).getByText("No items match.")).toBeInTheDocument();
  });
});
