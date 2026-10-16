import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { SubstanceArticle } from "@/schema";
import { DoseRangeStringInput } from "./DoseRangeStringInput";

function Harness({
  initial,
  onValue,
}: {
  initial: { min: number | null; max: number | null; unit: string };
  onValue: (value: unknown) => void;
}) {
  const methods = useForm<SubstanceArticle>({
    defaultValues: {
      dosage: { routes: [{ route: "oral", dose_ranges: { light: initial } }] },
    } as unknown as SubstanceArticle,
  });

  onValue(methods.watch("dosage.routes.0.dose_ranges.light"));

  return (
    <FormProvider {...methods}>
      <label htmlFor="light">Light</label>
      <DoseRangeStringInput id="light" name="dosage.routes.0.dose_ranges.light" />
      <button type="button">elsewhere</button>
    </FormProvider>
  );
}

function renderInput(initial: { min: number | null; max: number | null; unit: string } = { min: 10, max: 20, unit: "mg" }) {
  const seen: unknown[] = [];
  render(<Harness initial={initial} onValue={(value) => seen.push(value)} />);
  return {
    field: screen.getByLabelText("Light"),
    latest: () => seen[seen.length - 1],
  };
}

describe("DoseRangeStringInput", () => {
  it("preserves an empty range's stored unit when it is focused and blurred without editing", async () => {
    const user = userEvent.setup();
    const initial = { min: null, max: null, unit: "mg" };
    const { field, latest } = renderInput(initial);
    await user.click(field);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(latest()).toEqual(initial);
  });

  it("refuses an unparseable edit instead of destroying the stored dose", async () => {
    const user = userEvent.setup();
    const { field, latest } = renderInput();

    await user.clear(field);
    await user.type(field, "quite a lot");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not a dose range");
    // The stored value is exactly what it was; only the draft is unsaved.
    expect(latest()).toEqual({ min: 10, max: 20, unit: "mg" });
    expect(field).toHaveValue("quite a lot");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
