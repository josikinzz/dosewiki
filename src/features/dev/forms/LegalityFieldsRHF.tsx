/**
 * RHF-based Legality fields component.
 * Handles international treaties and country-specific legal status.
 * Layout mirrors the public article display with International and By Country subsections.
 */

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { CollapsibleSubsection } from "./FormHelpers";
import { ControlledTagMultiSelect, CountryLegalityCardEditor } from "./rhf";
import type { SubstanceArticle, Legality } from "@/schema";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";

export type LegalityFieldsRHFProps = {
  idPrefix: string;
};

export function LegalityFieldsRHF({ idPrefix: _idPrefix }: LegalityFieldsRHFProps) {
  const { setValue, getValues } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();
  const { content: legalityPrompt, isLoading: isPromptLoading } = useSectionPrompt("legality");

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated legality YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const legality = (parsed.legality ?? parsed) as Partial<Legality>;

      setValue("legality.international", legality.international ?? []);
      if (legality.countries) {
        setValue("legality.countries", legality.countries);
      }
    } catch (error) {
      console.error("Failed to parse generated legality YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-4">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Legality"
          sectionKey="legality"
          prompt={legalityPrompt}
          extractedContent={articlesContext.legalityQuotes}
          extractedSources={articlesContext.legalitySources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="legality"
          disabled={isPromptLoading || !legalityPrompt}
          disabledMessage={isPromptLoading ? "Loading prompt..." : "Prompt not found in Convex"}
        />
      )}

      {/* International Status */}
      <CollapsibleSubsection
        title="International"
        icon={<Icon icon="lucide:globe" size={20} />}
      >
        <ControlledTagMultiSelect
          name="legality.international"
          label="International Status"
          placeholder="Add international status"
          options={[]}
          addButtonLabel="Add status"
          openStrategy="focus"
        />
      </CollapsibleSubsection>

      {/* Country-Specific Status */}
      <CollapsibleSubsection
        title="By Country"
        icon={<Icon icon="lucide:map-pin" size={20} />}
      >
        <CountryLegalityCardEditor />
      </CollapsibleSubsection>
    </section>
  );
}
