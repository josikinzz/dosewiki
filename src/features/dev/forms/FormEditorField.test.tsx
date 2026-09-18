import type { PropsWithChildren } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => {} },
  releasePointerCapture: { configurable: true, value: () => {} },
  scrollIntoView: { configurable: true, value: () => {} },
});

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("./rhf", () => ({
  ControlledTagMultiSelect: ({ label }: { label: string }) => <div>{label}</div>,
}));

import { OverviewFieldsRHF } from "./OverviewFieldsRHF";

function Harness({
  children,
  onReady,
}: PropsWithChildren<{ onReady?: (methods: ReturnType<typeof useForm>) => void }>) {
  const methods = useForm<SubstanceArticle>({
    defaultValues: createEmptyArticle() as never,
  });
  onReady?.(methods as never);
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe("Overview fields", () => {
  it("offers hide for now as a shared article priority", async () => {
    const user = userEvent.setup();

    render(
      <Harness>
        <OverviewFieldsRHF idPrefix="article-form" categoryOptions={[]} indexCategoryOptions={[]} />
      </Harness>,
    );

    await user.click(screen.getByRole("combobox", { name: "Priority" }));

    expect(screen.getByRole("option", { name: /Hide for now/i })).toHaveTextContent(
      "Temporarily direct URL only",
    );
  });

  it("renders an Overview field error in the EditorField error slot", () => {
    let methods: ReturnType<typeof useForm> | null = null;

    render(
      <Harness
        onReady={(next) => {
          methods = next;
        }}
      >
        <OverviewFieldsRHF idPrefix="article-form" categoryOptions={[]} indexCategoryOptions={[]} />
      </Harness>,
    );

    expect(screen.queryByRole("alert")).toBeNull();

    // What `handleSubmit` does with a resolver rejection: the notice names the
    // section, and the field itself has to name the problem.
    act(() => {
      methods!.setError("identification.substitutive_name", {
        type: "custom",
        message: "Expected string, received number",
      });
    });

    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Expected string, received number");
    // EditorField also re-tones the label, so the field reads as highlighted
    // and not merely annotated.
    const label = message.closest("div")?.querySelector("label");
    expect(label?.className).toContain("theme-danger-text");
  });
});
