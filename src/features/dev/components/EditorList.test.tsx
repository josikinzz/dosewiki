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

  it("skips group headings with the keys and keeps them out of the options", () => {
    type Entry = { kind: "heading" | "row"; key: string; name: string };
    const entries: Entry[] = [
      { kind: "heading", key: "h-1", name: "Group one" },
      { kind: "row", key: "a", name: "Alpha" },
      { kind: "heading", key: "h-2", name: "Group two" },
      { kind: "row", key: "b", name: "Beta" },
    ];
    const onSelect = vi.fn();
    render(
      <EditorList
        items={entries}
        getKey={(entry) => entry.key}
        isOption={(entry) => entry.kind === "row"}
        renderItem={(entry, { selected }) =>
          entry.kind === "heading" ? <h3>{entry.name}</h3> : <EditorListItem active={selected} title={entry.name} tabIndex={-1} />
        }
        selectedKey="a"
        onSelect={onSelect}
        emptyText="Nothing."
        label="Grouped"
      />,
    );
    const listbox = screen.getByRole("listbox", { name: "Grouped" });
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Alpha", "Beta"]);

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(listbox, { key: "Home" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("ticks rows for bulk actions with a checkbox or Space, without moving the selection", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    render(
      <EditorList
        items={ITEMS.slice(0, 3)}
        getKey={(item) => item.slug}
        renderItem={(item, { selected }) => <EditorListItem active={selected} title={item.name} tabIndex={-1} />}
        selectedKey="item-1"
        onSelect={onSelect}
        multiSelect={{
          checkedKeys: new Set(["item-2"]),
          onToggle,
          checkLabel: (item) => `Select ${item.name}`,
          canCheck: (item) => item.slug !== "item-0",
        }}
        emptyText="Nothing."
        label="Checkable"
      />,
    );
    expect(screen.queryByRole("checkbox", { name: "Select Item 0" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Item 2" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Item 1" }));
    expect(onToggle).toHaveBeenLastCalledWith("item-1");
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("listbox", { name: "Checkable" }), { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
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
