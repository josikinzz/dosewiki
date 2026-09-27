import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { EditorList } from "./EditorList";
import { EditorListRow } from "./EditorListItem";

/** Anything the browser could move focus to, by Tab or by script. */
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable='true']";

const ITEMS = Array.from({ length: 1000 }, (_, index) => ({ slug: `item-${index}`, name: `Item ${index}` }));

function Harness({ onSelect, search = false }: { onSelect?: (key: string) => void; search?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <EditorList
      items={ITEMS}
      getKey={(item) => item.slug}
      renderItem={(item, { selected: active }) => <EditorListRow active={active} title={item.name} />}
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
          entry.kind === "heading" ? <h3>{entry.name}</h3> : <EditorListRow active={selected} title={entry.name} />
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
        renderItem={(item, { selected }) => <EditorListRow active={selected} title={item.name} />}
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
    const listbox = screen.getByRole("listbox", { name: "Checkable" });
    const [first, second, third] = within(listbox).getAllByRole("option");
    expect(first).not.toHaveAttribute("aria-checked");
    expect(screen.queryByTitle("Select Item 0")).not.toBeInTheDocument();
    expect(second).toHaveAttribute("aria-checked", "false");
    expect(third).toHaveAttribute("aria-checked", "true");
    // The current row is still the one selected option, apart from the bulk ticks.
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(third).toHaveAttribute("aria-selected", "false");

    fireEvent.click(screen.getByTitle("Select Item 1"));
    expect(onToggle).toHaveBeenLastCalledWith("item-1");
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(listbox, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(listbox.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    expect(within(listbox).queryByRole("checkbox")).not.toBeInTheDocument();
    // A finger-sized tick under a coarse pointer, and one focus cue: the open row's border.
    expect(screen.getByTitle("Select Item 1").className).toContain("[@media(pointer:coarse)]:h-11");
    expect(screen.getByTitle("Select Item 1").className).toContain("[@media(pointer:coarse)]:w-11");
    expect(listbox).toHaveClass("theme-dev-listbox");
    expect(second.querySelector(".theme-dev-list-row")).not.toBeNull();
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

  it("is one tab stop with no focusable descendants", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Harness />
        <button type="button">After</button>
      </>,
    );
    const listbox = screen.getByRole("listbox", { name: "Items" });
    expect(listbox.querySelectorAll(FOCUSABLE)).toHaveLength(0);

    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();
    expect(listbox).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(listbox).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
  });

  it("selects with ArrowDown, ArrowUp, Home and End from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = screen.getByRole("listbox", { name: "Items" });
    const active = () => document.getElementById(listbox.getAttribute("aria-activedescendant") ?? "");

    expect(listbox).not.toHaveAttribute("aria-activedescendant");
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Item 0");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toHaveTextContent("Item 2");
    await user.keyboard("{ArrowUp}");
    expect(active()).toHaveTextContent("Item 1");
    await user.keyboard("{End}");
    expect(active()).toHaveTextContent("Item 999");
    expect(active()).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(active()).toHaveTextContent("Item 0");
  });

  it("numbers the windowed options against the whole list", () => {
    type Entry = { kind: "heading" | "row"; key: string; name: string };
    const entries: Entry[] = [
      { kind: "heading", key: "h-1", name: "Group one" },
      { kind: "row", key: "a", name: "Alpha" },
      { kind: "row", key: "b", name: "Beta" },
      { kind: "heading", key: "h-2", name: "Group two" },
      { kind: "row", key: "c", name: "Gamma" },
    ];
    render(
      <EditorList
        items={entries}
        getKey={(entry) => entry.key}
        isOption={(entry) => entry.kind === "row"}
        renderItem={(entry, { selected }) =>
          entry.kind === "heading" ? <h3>{entry.name}</h3> : <EditorListRow active={selected} title={entry.name} />
        }
        emptyText="Nothing."
        label="Grouped"
      />,
    );
    const options = within(screen.getByRole("listbox", { name: "Grouped" })).getAllByRole("option");
    expect(options.map((option) => [option.getAttribute("aria-posinset"), option.getAttribute("aria-setsize")])).toEqual([
      ["1", "3"],
      ["2", "3"],
      ["3", "3"],
    ]);

    render(<Harness />);
    const windowed = within(screen.getByRole("listbox", { name: "Items" })).getAllByRole("option");
    expect(windowed[0]).toHaveAttribute("aria-setsize", "1000");
    expect(windowed[5]).toHaveAttribute("aria-posinset", "6");
  });

  it("keeps the active descendant mounted after the pointer scrolls it out of the window", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = screen.getByRole("listbox", { name: "Items" });
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowDown}");

    // A wheel or scrollbar drag moves the box without touching the selection.
    Object.defineProperty(listbox, "scrollTop", { configurable: true, writable: true, value: 500 * 60 });
    fireEvent.scroll(listbox);

    expect(within(listbox).queryByText("Item 3")).not.toBeInTheDocument();
    const activeId = listbox.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    const active = document.getElementById(activeId ?? "");
    expect(active).not.toBeNull();
    expect(listbox).toContainElement(active);
    expect(active).toHaveAttribute("role", "option");
    expect(active).toHaveTextContent("Item 1");
    expect(active).toHaveAttribute("aria-posinset", "2");

    // The keys still step from the selection, not from the scrolled window.
    await user.keyboard("{ArrowDown}");
    expect(document.getElementById(listbox.getAttribute("aria-activedescendant") ?? "")).toHaveTextContent("Item 2");
  });

  it("windows rows of different heights without looping, and keeps the selection in view", () => {
    // Rows with a pill are taller than rows without one. A shared pitch taken from
    // whichever row mounted first flipped as the window moved, and a selection near
    // the bottom of the box re-scrolled until React stopped it.
    const tall = (key: string) => Number(key.split("-")[1]) % 3 === 0;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.rowKey;
      const height = key ? (tall(key) ? 84 : 44) : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 300, height, toJSON: () => ({}) } as DOMRect;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "listbox" ? 300 : 0;
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<Harness />);
      const listbox = screen.getByRole("listbox", { name: "Items" });
      fireEvent.keyDown(listbox, { key: "End" });
      for (let step = 0; step < 12; step += 1) fireEvent.keyDown(listbox, { key: "ArrowUp" });
      for (let step = 0; step < 6; step += 1) fireEvent.keyDown(listbox, { key: "ArrowDown" });

      const active = within(listbox).getByRole("option", { selected: true });
      expect(active).toHaveTextContent("Item 993");
      // The row is drawn inside the window (not parked outside it), and where the
      // window draws it lies inside the box: the window's offset plus the measured
      // rows before it.
      const windowed = active.parentElement as HTMLElement;
      const shift = Number(/translateY\((\d+(?:\.\d+)?)px\)/.exec(windowed.style.transform)?.[1]);
      expect(Number.isFinite(shift)).toBe(true);
      let top = shift;
      for (const row of Array.from(windowed.children)) {
        if (row === active) break;
        top += row.getBoundingClientRect().height;
      }
      expect(top).toBeGreaterThanOrEqual(listbox.scrollTop);
      expect(top + 44).toBeLessThanOrEqual(listbox.scrollTop + 300);
      expect(errors.mock.calls.flat().join(" ")).not.toMatch(/Maximum update depth/);
    } finally {
      rect.mockRestore();
      client.mockRestore();
      errors.mockRestore();
    }
  });
});
