import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { TextListInput } from "./rhf";
import { CollapsibleSubsection } from "./FormHelpers";
import type { Interactions, SubstanceArticle } from "@/schema";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";

export function InteractionsFieldsRHF() {
  const { getValues, setValue } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();
  const { content: interactionsPrompt } = useSectionPrompt("interactions");

  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      return yaml.stringify(getValues(), { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const interactions = (parsed.interactions ?? parsed) as Partial<Interactions>;

      setValue("interactions.dangerous", interactions.dangerous ?? []);
      setValue("interactions.unsafe", interactions.unsafe ?? []);
      setValue("interactions.caution", interactions.caution ?? []);
    } catch (error) {
      console.error("Failed to parse generated interactions YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-4">
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Interactions"
          sectionKey="interactions"
          prompt={interactionsPrompt}
          extractedContent={null}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
        />
      )}

      <CollapsibleSubsection
        title="Dangerous Combinations"
        icon={<Icon icon="lucide:skull" className="h-5 w-5 text-red-400" size={20} />}
      >
        <TextListInput
          name="interactions.dangerous"
          label="Dangerous"
          placeholder="e.g., Alcohol (Both substances cause...)"
          addButtonLabel="Add dangerous"
        />
      </CollapsibleSubsection>

      <CollapsibleSubsection
        title="Unsafe Combinations"
        icon={<Icon icon="lucide:hospital" className="h-5 w-5 text-orange-400" size={20} />}
      >
        <TextListInput
          name="interactions.unsafe"
          label="Unsafe"
          placeholder="e.g., Opioids (Risk of respiratory...)"
          addButtonLabel="Add unsafe"
        />
      </CollapsibleSubsection>

      <CollapsibleSubsection
        title="Use with Caution"
        icon={<Icon icon="lucide:triangle-alert" className="h-5 w-5 text-amber-400" size={20} />}
      >
        <TextListInput
          name="interactions.caution"
          label="Caution"
          placeholder="e.g., Cannabis (May intensify...)"
          addButtonLabel="Add caution"
        />
      </CollapsibleSubsection>
    </section>
  );
}
