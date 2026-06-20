import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { EditorStatusPill } from "@/features/dev/components";
import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { TextListInput } from "./rhf";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
import type { SubstanceArticle } from "@/schema";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { buildGeneratedSectionUpdate } from "@/lib/article/generatedSectionUpdate";

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
      const result = buildGeneratedSectionUpdate(
        getValues(),
        "interactions",
        { kind: "generated_yaml", content: generatedYaml },
        "editor_apply",
      );
      const interactions = result.nextArticle.interactions;

      setValue("interactions.dangerous", interactions.dangerous);
      setValue("interactions.unsafe", interactions.unsafe);
      setValue("interactions.caution", interactions.caution);
    } catch (error) {
      console.error("Failed to parse generated interactions YAML:", error);
    }
  }, [getValues, setValue]);

  return (
    <section className="space-y-4">
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Interactions"
          sectionKey="interactions"
          prompt={interactionsPrompt}
          extractedContent={null}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
        />
      )}

      <CollapsibleEditorCard
        density="compact"
        title="Dangerous Combinations"
        icon={<Icon icon="lucide:skull" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="danger" icon="lucide:skull" data-badge-tone="red">
            Dangerous
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.dangerous"
          label="Dangerous"
          placeholder="e.g., Alcohol (Both substances cause...)"
          addButtonLabel="Add dangerous"
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        title="Unsafe Combinations"
        icon={<Icon icon="lucide:hospital" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="warning" icon="lucide:hospital" data-badge-tone="orange">
            Unsafe
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.unsafe"
          label="Unsafe"
          placeholder="e.g., Opioids (Risk of respiratory...)"
          addButtonLabel="Add unsafe"
        />
      </CollapsibleEditorCard>

      <CollapsibleEditorCard
        density="compact"
        title="Use with Caution"
        icon={<Icon icon="lucide:triangle-alert" className="h-5 w-5" size={20} />}
        badge={
          <EditorStatusPill tone="warning" icon="lucide:triangle-alert">
            Caution
          </EditorStatusPill>
        }
      >
        <TextListInput
          name="interactions.caution"
          label="Caution"
          placeholder="e.g., Cannabis (May intensify...)"
          addButtonLabel="Add caution"
        />
      </CollapsibleEditorCard>
    </section>
  );
}
