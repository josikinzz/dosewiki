import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorFieldRow } from "@/features/dev/components";
import { FormEditorField } from "./FormEditorField";
import { CharacterCount, CollapsibleSubsection } from "./FormHelpers";
import type {
  CarcinogenicityLevel,
  LD50Entry,
  OrganToxicityEntry,
  SubstanceArticle,
} from "@/schema";
import {
  CARCINOGENICITY_LEVEL_OPTIONS,
  LD50ArrayEditor,
  OrganToxicityArrayEditor,
  RiskLevelSelect,
} from "./contentFieldsShared";

export type AddictionFieldsRHFProps = {
  idPrefix: string;
  pairedIndicator?: boolean;
};

export function AddictionFieldsRHF({ idPrefix, pairedIndicator = false }: AddictionFieldsRHFProps) {
  const { register, setValue, watch } = useFormContext<SubstanceArticle>();

  const psychologicalDesc = watch("harm_potential.addiction.psychological.description") ?? "";
  const physicalDesc = watch("harm_potential.addiction.physical_dependence.description") ?? "";
  const psychologicalLevel = watch("harm_potential.addiction.psychological.level");
  const physicalLevel = watch("harm_potential.addiction.physical_dependence.level");
  const psychosisLevel = watch("harm_potential.psychosis.level");
  const seizureLevel = watch("harm_potential.seizure.level");
  const carcinogenicityLevel = watch("harm_potential.toxicity.carcinogenicity.level");

  const ld50Entries = (() => {
    const currentValue = watch("harm_potential.toxicity.lethal_dosage.ld50");
    if (Array.isArray(currentValue)) {
      return currentValue as LD50Entry[];
    }

    const legacyValue = watch("harm_potential.toxicity.ld50");
    return Array.isArray(legacyValue) ? (legacyValue as LD50Entry[]) : [];
  })();

  const organToxicityEntries = (() => {
    const currentValue = watch("harm_potential.toxicity.organ_toxicity");
    return Array.isArray(currentValue) ? (currentValue as OrganToxicityEntry[]) : [];
  })();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h3 className="theme-accent-heading flex items-center gap-2 text-sm font-semibold">
          <Icon icon="jam:repeat" className="theme-icon-accent h-5 w-5" size={20} />
          Addiction & Dependence
        </h3>
        <EditorFieldRow layout="twoColumn">
          <div className="space-y-2">
            <FormEditorField
              htmlFor={`${idPrefix}-psych-level`}
              label="Psychological Addiction"
              name="harm_potential.addiction.psychological.level"
            >
              <RiskLevelSelect
                id={`${idPrefix}-psych-level`}
                value={psychologicalLevel}
                onChange={(nextValue) => setValue("harm_potential.addiction.psychological.level", nextValue)}
              />
            </FormEditorField>
            <FormEditorField
              htmlFor={`${idPrefix}-psych-desc`}
              label="Psychological Addiction Notes"
              name="harm_potential.addiction.psychological.description"
            >
              <Textarea
                id={`${idPrefix}-psych-desc`}
                className="min-h-[80px]"
                {...register("harm_potential.addiction.psychological.description")}
                placeholder="Describe psychological dependence risk and compulsive use patterns."
              />
              <CharacterCount value={psychologicalDesc} />
            </FormEditorField>
          </div>

          <div className="space-y-2">
            <FormEditorField
              htmlFor={`${idPrefix}-phys-level`}
              label="Physical Dependence"
              name="harm_potential.addiction.physical_dependence.level"
            >
              <RiskLevelSelect
                id={`${idPrefix}-phys-level`}
                value={physicalLevel}
                onChange={(nextValue) => setValue("harm_potential.addiction.physical_dependence.level", nextValue)}
              />
            </FormEditorField>
            <FormEditorField
              htmlFor={`${idPrefix}-phys-desc`}
              label="Physical Dependence Notes"
              name="harm_potential.addiction.physical_dependence.description"
            >
              <Textarea
                id={`${idPrefix}-phys-desc`}
                className="min-h-[80px]"
                {...register("harm_potential.addiction.physical_dependence.description")}
                placeholder="Describe physical dependence risk and withdrawal potential."
              />
              <CharacterCount value={physicalDesc} />
            </FormEditorField>
          </div>
        </EditorFieldRow>
      </div>

      <CollapsibleSubsection
        title="Toxicity"
        pairedIndicator={pairedIndicator}
        description={pairedIndicator ? "Lethal dosage, organ toxicity, and carcinogenicity" : undefined}
        icon={<Icon icon="healthicons:poison-24px" className="h-5 w-5" size={20} />}
      >
        <div className="space-y-4">
          <FormEditorField
            htmlFor={`${idPrefix}-lethal-dosage-notes`}
            label="Lethal Dosage Notes"
            name="harm_potential.toxicity.lethal_dosage.notes"
          >
            <Textarea
              id={`${idPrefix}-lethal-dosage-notes`}
              className="min-h-[60px]"
              {...register("harm_potential.toxicity.lethal_dosage.notes")}
              placeholder="Approximate lethal dose estimates, human case reports, or informal data that doesn't fit the LD50 table format."
            />
          </FormEditorField>

          <LD50ArrayEditor
            entries={ld50Entries}
            onChange={(entries) => setValue("harm_potential.toxicity.lethal_dosage.ld50", entries)}
          />

          <OrganToxicityArrayEditor
            entries={organToxicityEntries}
            onChange={(entries) => setValue("harm_potential.toxicity.organ_toxicity", entries)}
          />

          <EditorFieldRow layout="twoColumn">
            <FormEditorField
              htmlFor={`${idPrefix}-carc-level`}
              label="Carcinogenicity Level"
              name="harm_potential.toxicity.carcinogenicity.level"
            >
              <Select
                value={carcinogenicityLevel ?? "none"}
                onValueChange={(nextValue) => setValue(
                  "harm_potential.toxicity.carcinogenicity.level",
                  nextValue === "none" ? null : (nextValue as CarcinogenicityLevel),
                )}
              >
                <SelectTrigger id={`${idPrefix}-carc-level`}>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {CARCINOGENICITY_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value || "none"} value={option.value || "none"}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormEditorField>
            <FormEditorField
              htmlFor={`${idPrefix}-carc-desc`}
              label="Carcinogenicity Notes"
              name="harm_potential.toxicity.carcinogenicity.description"
            >
              <Input
                id={`${idPrefix}-carc-desc`}
                {...register("harm_potential.toxicity.carcinogenicity.description")}
                placeholder="e.g., No evidence / IARC Group 2B"
              />
            </FormEditorField>
          </EditorFieldRow>

          <FormEditorField
            htmlFor={`${idPrefix}-toxicity-other`}
            label="Other Toxicity Notes"
            name="harm_potential.toxicity.other"
          >
            <Textarea
              id={`${idPrefix}-toxicity-other`}
              className="min-h-[60px]"
              {...register("harm_potential.toxicity.other")}
              placeholder="e.g., Neurotoxicity at high doses"
            />
          </FormEditorField>
        </div>
      </CollapsibleSubsection>

      <CollapsibleSubsection
        title={pairedIndicator ? "Psychosis & seizure" : "Risks"}
        pairedIndicator={pairedIndicator}
        icon={<Icon icon="streamline:dangerous-zone-sign-remix" className="h-5 w-5" size={20} />}
      >
        <EditorFieldRow layout="twoColumn">
          <div className="space-y-2">
            <FormEditorField
              htmlFor={`${idPrefix}-psychosis-level`}
              label="Psychosis Risk"
              name="harm_potential.psychosis.level"
            >
              <RiskLevelSelect
                id={`${idPrefix}-psychosis-level`}
                value={psychosisLevel}
                onChange={(nextValue) => setValue("harm_potential.psychosis.level", nextValue)}
              />
            </FormEditorField>
            <FormEditorField
              htmlFor={`${idPrefix}-psychosis-desc`}
              label="Psychosis Notes"
              name="harm_potential.psychosis.description"
            >
              <Textarea
                id={`${idPrefix}-psychosis-desc`}
                className="min-h-[60px]"
                {...register("harm_potential.psychosis.description")}
                placeholder="Describe psychosis risk factors."
              />
            </FormEditorField>
          </div>

          <div className="space-y-2">
            <FormEditorField
              htmlFor={`${idPrefix}-seizure-level`}
              label="Seizure Risk"
              name="harm_potential.seizure.level"
            >
              <RiskLevelSelect
                id={`${idPrefix}-seizure-level`}
                value={seizureLevel}
                onChange={(nextValue) => setValue("harm_potential.seizure.level", nextValue)}
              />
            </FormEditorField>
            <FormEditorField
              htmlFor={`${idPrefix}-seizure-desc`}
              label="Seizure Notes"
              name="harm_potential.seizure.description"
            >
              <Textarea
                id={`${idPrefix}-seizure-desc`}
                className="min-h-[60px]"
                {...register("harm_potential.seizure.description")}
                placeholder="Describe seizure threshold effects."
              />
            </FormEditorField>
          </div>
        </EditorFieldRow>
      </CollapsibleSubsection>
    </section>
  );
}
