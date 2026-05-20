import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { triggerSectionDragEnd } = vi.hoisted(() => ({
  triggerSectionDragEnd: { current: null as null | ((payload: unknown) => void) },
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => <span>icon</span>,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (payload: unknown) => void }) => {
    triggerSectionDragEnd.current = onDragEnd ?? null;
    return <div>{children}</div>;
  },
  KeyboardSensor: class {},
  PointerSensor: class {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  arrayMove: <T,>(items: T[], fromIndex: number, toIndex: number) => {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

vi.mock("@/data/config/categoryIcons", () => ({
  getCategoryIcon: () => "sparkle",
}));

vi.mock("./AddSubstanceControl", () => ({
  AddSubstanceControl: () => <div>Add substance control</div>,
}));

vi.mock("./CategoryEditorDetailsPanel", () => ({
  CategoryEditorDetailsPanel: () => <div>Details</div>,
}));

vi.mock("./SectionEditor", () => ({
  SectionEditor: ({ section }: { section: { label: string } }) => <div>{section.label}</div>,
}));

vi.mock("./SubstanceListItem", () => ({
  SubstanceListItem: ({ status }: { status: { slug: string } }) => <div>{status.slug}</div>,
}));

import { CategoryEditor } from "./CategoryEditor";

const baseCategory = {
  key: "phenethylamines",
  label: "Phenethylamines",
  iconKey: "sparkle",
  notes: "",
  drugs: ["alpha-entry"],
  sections: [
    { key: "section-a", label: "Section A", drugs: ["beta-entry"] },
    { key: "section-b", label: "Section B", drugs: ["gamma-entry"] },
  ],
};

describe("CategoryEditor", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("wires add and remove category actions", () => {
    const onAddSection = vi.fn();
    const onRemoveCategory = vi.fn();

    render(
      <CategoryEditor
        category={baseCategory}
        index={1}
        total={3}
        maxColumns={3}
        columnCount={3}
        sortableId="category-1"
        onUpdateCategory={vi.fn()}
        onRemoveCategory={onRemoveCategory}
        onMoveCategory={vi.fn()}
        onSetColumn={vi.fn()}
        onAddSection={onAddSection}
        substanceOptions={[]}
        datasetSlugSet={new Set(["alpha-entry", "beta-entry", "gamma-entry"])}
        sortSlugsWithCommonPriority={(slugs) => [...slugs].sort()}
        resolveSlugStatus={(slug) => ({ slug, issues: [] })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    expect(onAddSection).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove category" }));
    expect(onRemoveCategory).toHaveBeenCalledWith(1);
  });

  it("reorders sections through the drag-end handler", () => {
    const onUpdateCategory = vi.fn();

    render(
      <CategoryEditor
        category={baseCategory}
        index={0}
        total={2}
        maxColumns={3}
        columnCount={3}
        sortableId="category-0"
        onUpdateCategory={onUpdateCategory}
        onRemoveCategory={vi.fn()}
        onMoveCategory={vi.fn()}
        onSetColumn={vi.fn()}
        onAddSection={vi.fn()}
        substanceOptions={[]}
        datasetSlugSet={new Set(["alpha-entry", "beta-entry", "gamma-entry"])}
        sortSlugsWithCommonPriority={(slugs) => [...slugs].sort()}
        resolveSlugStatus={(slug) => ({ slug, issues: [] })}
      />,
    );

    triggerSectionDragEnd.current?.({
      active: { id: "phenethylamines::section-a" },
      over: { id: "phenethylamines::section-b" },
    });

    expect(onUpdateCategory).toHaveBeenCalledTimes(1);
    const updater = onUpdateCategory.mock.calls[0][1] as (current: typeof baseCategory) => typeof baseCategory;
    const nextCategory = updater(baseCategory);
    expect(nextCategory.sections.map((section) => section.key)).toEqual(["section-b", "section-a"]);
  });
});
