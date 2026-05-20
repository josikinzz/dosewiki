import type { PropsWithChildren } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstanceArticle } from "@/schema";

const { sectionGeneratorProps } = vi.hoisted(() => ({
  sectionGeneratorProps: { current: null as null | { onApply: (yaml: string) => void } },
}));

vi.mock("../tools/substance-editor/SectionGenerator", () => ({
  SectionGenerator: (props: { onApply: (yaml: string) => void }) => {
    sectionGeneratorProps.current = props;
    return (
      <button type="button" onClick={() => props.onApply(`
pharmacology:
  pharmacodynamics: Test dynamics
  summary: Test summary
  receptor_profile:
    - receptor: 5-HT2A
      tag: agonist
      affinity: Ki = 2.9 nM
      efficacy: partial agonist
  pharmacokinetics: Test kinetics
  metabolites:
    - Nor-LSD
  route_bioavailability:
    insufflated: 65-80%
  route_bioavailability_notes:
    oral: first-pass metabolism
  route_half_life:
    intravenous: 2-3 hours
  route_half_life_notes:
    sublingual: faster onset
  bioavailability_notes: General bioavailability note
  half_life: General half-life note
`)}>
        Apply generated pharmacology
      </button>
    );
  },
}));

vi.mock("../tools/substance-editor/SubstanceEditorContext", () => ({
  useOptionalSubstanceEditorContext: () => ({
    pharmacologyQuotes: "quotes",
    pharmacologySources: null,
    getAllSources: () => [],
    apiKey: "key",
    model: "model",
    isKeyValid: true,
    selectedSubstanceSlug: "lsd",
  }),
}));

vi.mock("@/hooks/usePrompts", () => ({
  useSectionPrompt: () => ({
    content: "Test prompt",
  }),
}));

vi.mock("./rhf", () => ({
  ControlledTagMultiSelect: ({ label }: { label: string }) => <div>{label}</div>,
}));

const defaultValues = {
  pharmacology: {
    pharmacodynamics: "",
    summary: "",
    receptor_profile: [],
    pharmacokinetics: "",
    metabolites: [],
    protein_binding: "",
    volume_of_distribution: "",
    route_bioavailability: {},
    route_half_life: {},
    route_half_life_notes: {},
    route_bioavailability_notes: {},
    bioavailability_notes: "",
    half_life: "",
  },
  dosage: {
    routes: [
      {
        route: "Oral",
        bioavailability: "",
        bioavailability_notes: "",
        dose_ranges: {
          threshold: { min: null, max: null, unit: "" },
          light: { min: null, max: null, unit: "" },
          moderate: { min: null, max: null, unit: "" },
          strong: { min: null, max: null, unit: "" },
          heavy: { min: null, max: null, unit: "" },
        },
        notes: "",
      },
    ],
  },
  duration: {
    routes: [
      {
        route: "Sublingual",
        half_life: "",
        half_life_notes: "",
        stages: {
          onset: { min: null, max: null, unit: "" },
          come_up: { min: null, max: null, unit: "" },
          peak: { min: null, max: null, unit: "" },
          offset: { min: null, max: null, unit: "" },
          after_effects: { min: null, max: null, unit: "" },
          total_duration: { min: null, max: null, unit: "" },
        },
      },
    ],
  },
} as unknown as SubstanceArticle;

let latestMethods: ReturnType<typeof useForm<SubstanceArticle>> | null = null;

function FormWrapper({ children }: PropsWithChildren) {
  const methods = useForm<SubstanceArticle>({
    defaultValues,
  });
  latestMethods = methods;
  return <FormProvider {...methods}>{children}</FormProvider>;
}

import { ChemistryFieldsRHF } from "./ChemistryFieldsRHF";

describe("Pharmacology editor fields", () => {
  beforeEach(() => {
    latestMethods = null;
    sectionGeneratorProps.current = null;
  });

  it("applies generated pharmacology data into pharmacology, dosage, and duration fields", async () => {
    render(
      <FormWrapper>
        <ChemistryFieldsRHF idPrefix="chemistry" mechanismOptions={[]} />
      </FormWrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply generated pharmacology" }));

    await waitFor(() => {
      expect(latestMethods?.getValues("pharmacology.pharmacodynamics")).toBe("Test dynamics");
    });

    expect(latestMethods?.getValues("pharmacology.summary")).toBe("Test summary");
    expect(latestMethods?.getValues("pharmacology.receptor_profile.0.receptor")).toBe("5-HT2A");
    expect(latestMethods?.getValues("pharmacology.metabolites")).toEqual(["Nor-LSD"]);
    expect(latestMethods?.getValues("pharmacology.bioavailability_notes")).toBe("General bioavailability note");
    expect(latestMethods?.getValues("pharmacology.half_life")).toBe("General half-life note");

    expect(latestMethods?.getValues("dosage.routes.0.bioavailability_notes")).toBe("first-pass metabolism");

    const dosageRoutes = latestMethods?.getValues("dosage.routes") ?? [];
    const durationRoutes = latestMethods?.getValues("duration.routes") ?? [];

    expect(dosageRoutes.find((route) => route.route === "Insufflated")?.bioavailability).toBe("65-80%");
    expect(durationRoutes.find((route) => route.route === "Sublingual")?.half_life_notes).toBe("faster onset");
    expect(durationRoutes.find((route) => route.route === "Intravenous")?.half_life).toBe("2-3 hours");
  });
});
