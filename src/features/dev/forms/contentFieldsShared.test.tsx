import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LD50Entry, OrganToxicityEntry } from "@/schema";

import { LD50ArrayEditor, OrganToxicityArrayEditor } from "./contentFieldsShared";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

function LD50Harness({ initial }: { initial: LD50Entry[] }) {
  const [entries, setEntries] = useState(initial);
  return <LD50ArrayEditor entries={entries} onChange={setEntries} />;
}

function OrganToxicityHarness({ initial }: { initial: OrganToxicityEntry[] }) {
  const [entries, setEntries] = useState(initial);
  return <OrganToxicityArrayEditor entries={entries} onChange={setEntries} />;
}

describe("LD50ArrayEditor", () => {
  it("associates every entry control with its label", () => {
    render(<LD50Harness initial={[{ species: "Rat", route: "Oral", value: 400, unit: "mg/kg" }]} />);

    expect(screen.getByLabelText("Value")).toHaveValue(400);
    expect(screen.getByLabelText("Unit")).toHaveValue("mg/kg");
  });

  it("keeps rows keyed to their entry when a middle row is removed", () => {
    render(
      <LD50Harness
        initial={[
          { species: "Mouse", route: "Oral", value: 1, unit: "a" },
          { species: "Rat", route: "Oral", value: 2, unit: "b" },
          { species: "Dog", route: "Oral", value: 3, unit: "c" },
        ]}
      />,
    );

    const [, , thirdUnitBefore] = screen.getAllByLabelText("Unit");

    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    const remove = screen.getByRole("button", { name: "Remove Rat · Oral" });
    fireEvent.click(remove);
    expect(screen.getAllByLabelText("Unit").map((input) => (input as HTMLInputElement).value)).toEqual(["a", "b", "c"]);
    confirmation.mockReturnValue(true);
    fireEvent.click(remove);
    confirmation.mockRestore();

    const units = screen.getAllByLabelText("Unit");
    expect(units).toHaveLength(2);
    expect(units.map((input) => (input as HTMLInputElement).value)).toEqual(["a", "c"]);
    // Index keys would discard the third row's DOM node and re-point the second
    // slot at the removed row's element; stable keys carry the survivor over.
    expect(units[1]).toBe(thirdUnitBefore);
  });

  it("appends a blank entry without disturbing existing rows", () => {
    render(<LD50Harness initial={[{ species: "Mouse", route: "Oral", value: 1, unit: "a" }]} />);

    fireEvent.click(screen.getByRole("button", { name: /Add LD50 entry/i }));

    const units = screen.getAllByLabelText("Unit");
    expect(units.map((input) => (input as HTMLInputElement).value)).toEqual(["a", "mg/kg"]);
  });
});

describe("OrganToxicityArrayEditor", () => {
  it("keeps rows keyed to their entry when a middle row is removed", () => {
    render(
      <OrganToxicityHarness
        initial={[
          { system: "Hepatic", findings: "one", mechanism: "", notes: "" },
          { system: "Renal", findings: "two", mechanism: "", notes: "" },
          { system: "Cardiovascular", findings: "three", mechanism: "", notes: "" },
        ]}
      />,
    );

    const [, , thirdFindingsBefore] = screen.getAllByLabelText("Findings");

    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    const remove = screen.getByRole("button", { name: "Remove Renal" });
    fireEvent.click(remove);
    expect(screen.getAllByLabelText("Findings").map((input) => (input as HTMLTextAreaElement).value)).toEqual(["one", "two", "three"]);
    confirmation.mockReturnValue(true);
    fireEvent.click(remove);
    confirmation.mockRestore();

    const findings = screen.getAllByLabelText("Findings");
    expect(findings.map((input) => (input as HTMLTextAreaElement).value)).toEqual(["one", "three"]);
    expect(findings[1]).toBe(thirdFindingsBefore);
  });
});
