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

function renderInput(initial = { min: 10, max: 20, unit: "mg" }) {
  const seen: unknown[] = [];
  render(<Harness initial={initial} onValue={(value) => seen.push(value)} />);
  return {
    field: screen.getByLabelText("Light"),
    latest: () => seen[seen.length - 1],
  };
}

describe("DoseRangeStringInput", () => {
  it("seeds itself from the stored range and normalizes a valid edit", async () => {
    const user = userEvent.setup();
    const { field, latest } = renderInput();
    expect(field).toHaveValue("10-20 mg");

    await user.clear(field);
    await user.type(field, "15 - 30 mg");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(latest()).toEqual({ min: 15, max: 30, unit: "mg" });
    expect(field).toHaveValue("15-30 mg");
  });

  it("preserves an empty range's stored unit when it is focused and blurred without editing", async () => {
    const user = userEvent.setup();
    const initial = { min: null, max: null, unit: "mg" };
    const { field, latest } = renderInput(initial);
    await user.click(field);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(latest()).toEqual(initial);
  });

  it("accepts the tilde form the article renders for a threshold", async () => {
    const user = userEvent.setup();
    const { field, latest } = renderInput({ min: null, max: null, unit: "" });

    await user.type(field, "~10 mg");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(latest()).toEqual({ min: 10, max: null, unit: "mg" });
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

  it("clears the field on an empty edit", async () => {
    const user = userEvent.setup();
    const { field, latest } = renderInput();

    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(latest()).toEqual({ min: null, max: null, unit: "" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops the error as soon as the text changes again", async () => {
    const user = userEvent.setup();
    const { field } = renderInput();

    await user.clear(field);
    await user.type(field, "nope");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(field, "5 mg");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
