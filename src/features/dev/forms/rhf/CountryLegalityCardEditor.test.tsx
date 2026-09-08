import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { CountryLegality, SubstanceArticle } from "@/schema";
import { CountryLegalityCardEditor } from "./CountryLegalityCardEditor";

function Harness({ countries, collect, submit }: {
  countries?: Record<string, CountryLegality>;
  collect: (article: SubstanceArticle) => void;
  submit: () => void;
}) {
  const methods = useForm<SubstanceArticle>({
    defaultValues: { legality: { international: [], countries } },
  });
  return <FormProvider {...methods}>
    <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <CountryLegalityCardEditor />
      <button type="button" onClick={() => collect(methods.getValues())}>Collect draft</button>
      <button type="submit">Submit article</button>
    </form>
  </FormProvider>;
}

describe("CountryLegalityCardEditor", () => {
  it("adds the first country with Enter without submitting the article or interrupting IME composition", async () => {
    const user = userEvent.setup();
    const collect = vi.fn();
    const submit = vi.fn();
    render(<Harness collect={collect} submit={submit} />);
    const name = screen.getByLabelText("New country");
    await user.type(name, "  Fixture Country  ");
    fireEvent.keyDown(name, { key: "Enter", isComposing: true });
    expect(screen.queryByRole("button", { name: "Remove Fixture Country" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Remove Fixture Country" })).toBeInTheDocument();
    expect(name).toHaveValue("");
    expect(submit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Status text"), "Fixture status");
    await user.click(screen.getByRole("button", { name: "Collect draft" }));
    expect(collect.mock.calls[0][0].legality).toEqual({
      international: [], countries: { "Fixture Country": { status: "Fixture status", notes: "" } },
    });
  });

  it("adds a literal country key without replacing existing metadata and rejects a duplicate", async () => {
    const user = userEvent.setup();
    const collect = vi.fn();
    const existing = { status: "Fixture status", notes: "Fixture notes", instrument: "Fixture instrument", canonicalStatus: "restricted_other" as const };
    render(<Harness countries={{ Existing: existing }} collect={collect} submit={vi.fn()} />);
    const name = screen.getByLabelText("New country");
    await user.type(name, "St. Fixture [[North]");
    await user.click(screen.getByRole("button", { name: "Add country" }));
    expect(screen.getByRole("button", { name: "Remove St. Fixture [North]" })).toBeInTheDocument();
    await user.type(name, " existing ");
    await user.click(screen.getByRole("button", { name: "Add country" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collect draft" }));
    expect(collect.mock.calls[0][0].legality.countries).toEqual({
      Existing: existing,
      "St. Fixture [North]": { status: "", notes: "" },
    });
  });
});
