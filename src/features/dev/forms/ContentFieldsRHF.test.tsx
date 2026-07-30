import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";

vi.mock("./rhf", () => ({
  ControlledTagMultiSelect: ({ label }: { label: string }) => <div>{label}</div>,
  TextListInput: ({ label }: { label: string }) => <div>{label}</div>,
}));

import {
  AddictionFieldsRHF,
  InteractionsFieldsRHF,
  NotesFieldsRHF,
  ToleranceFieldsRHF,
} from "./ContentFieldsRHF";

const defaultValues = {
  summary: "",
  harm_potential: {
    addiction: {
      psychological: { level: null, description: "" },
      physical_dependence: { level: null, description: "" },
    },
    toxicity: {
      lethal_dosage: { notes: "", ld50: [] },
      organ_toxicity: [],
      carcinogenicity: { level: null, evidence: null, description: "" },
      antibiotic_function: { level: null, description: "" },
      other: "",
    },
    psychosis: { level: null, description: "" },
    seizure: { level: null, description: "" },
  },
  interactions: {
    dangerous: [],
    unsafe: [],
    caution: [],
  },
  tolerance: {
    full_tolerance: "",
    half_tolerance: "",
    baseline_tolerance: "",
    cross_tolerance: [],
  },
} as unknown as SubstanceArticle;

function FormWrapper({ children }: PropsWithChildren) {
  const methods = useForm<SubstanceArticle>({
    defaultValues,
  });

  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe("ContentFieldsRHF barrel exports", () => {
  it("renders the harm-potential section headings", () => {
    render(
      <FormWrapper>
        <AddictionFieldsRHF idPrefix="content" />
      </FormWrapper>,
    );

    expect(screen.getByText("Addiction & Dependence")).toBeInTheDocument();
    expect(screen.getByText("Toxicity")).toBeInTheDocument();
    expect(screen.getByText("Risks")).toBeInTheDocument();
  });

  it("renders the interaction section groups", () => {
    render(
      <FormWrapper>
        <InteractionsFieldsRHF />
      </FormWrapper>,
    );

    expect(screen.getByText("Dangerous Combinations")).toBeInTheDocument();
    expect(screen.getByText("Unsafe Combinations")).toBeInTheDocument();
    expect(screen.getByText("Use with Caution")).toBeInTheDocument();
  });

  it("renders the tolerance labels from the compatibility barrel", () => {
    render(
      <FormWrapper>
        <ToleranceFieldsRHF idPrefix="content" />
      </FormWrapper>,
    );

    expect(screen.getByText("Full Tolerance")).toBeInTheDocument();
    expect(screen.getByText("Half Tolerance")).toBeInTheDocument();
    expect(screen.getByText("Baseline Reset")).toBeInTheDocument();
    expect(screen.getByText("Cross Tolerances")).toBeInTheDocument();
  });

  it("renders the summary notes section", () => {
    render(
      <FormWrapper>
        <NotesFieldsRHF idPrefix="content" />
      </FormWrapper>,
    );

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Brief summary of the substance.")).toBeInTheDocument();
  });
});
