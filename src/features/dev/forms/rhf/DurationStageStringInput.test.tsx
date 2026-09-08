import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { DurationStage, SubstanceArticle } from "@/schema";
import { DurationStageStringInput } from "./DurationStageStringInput";

function Harness({ initial, onValue }: { initial: DurationStage; onValue: (value: unknown) => void }) {
  const methods = useForm<SubstanceArticle>({
    defaultValues: { duration: { routes: [{ route: "Oral", stages: { onset: initial } }] } },
  });
  onValue(methods.watch("duration.routes.0.stages.onset"));
  return (
    <FormProvider {...methods}>
      <label htmlFor="onset">Onset</label>
      <DurationStageStringInput id="onset" name="duration.routes.0.stages.onset" />
      <button type="button">Elsewhere</button>
    </FormProvider>
  );
}

describe("DurationStageStringInput", () => {
  it("preserves a stored empty stage and its unit when visited without editing", async () => {
    const user = userEvent.setup();
    const initial = { min: null, max: null, unit: "minutes" };
    let latest: unknown;
    render(<Harness initial={initial} onValue={(value) => { latest = value; }} />);
    await user.click(screen.getByLabelText("Onset"));
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(latest).toEqual(initial);
  });

  it("preserves stored timing after an invalid edit but permits an explicit clear", async () => {
    const user = userEvent.setup();
    const initial = { min: 15, max: 30, unit: "minutes" };
    let latest: unknown;
    render(<Harness initial={initial} onValue={(value) => { latest = value; }} />);
    const input = screen.getByLabelText("Onset");
    await user.clear(input);
    await user.type(input, "eventually");
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(latest).toEqual(initial);
    expect(input).toHaveValue("eventually");

    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(latest).toEqual({ min: null, max: null, unit: "" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
