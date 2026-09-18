/**
 * React Hook Form-based article draft form fields.
 * Uses FormProvider for child components to access form context.
 */

import { useCallback, useEffect, type FormEvent } from "react";
import { FormProvider } from "react-hook-form";

import { useDevTagOptions } from "@/hooks/useDevTagOptions";
import { useArticleForm, type UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { SubstanceArticle } from "@/schema";

import { ArticleFormProvider } from "./ArticleFormContext";

import { OverviewFieldsRHF } from "./OverviewFieldsRHF";
import { ClassificationFieldsRHF } from "./ClassificationFieldsRHF";
import { DosageDurationFieldsRHF } from "./DosageDurationFieldsRHF";
import { ChemistryFieldsRHF } from "./ChemistryFieldsRHF";
import {
  AddictionFieldsRHF,
  InteractionsFieldsRHF,
  ToleranceFieldsRHF,
  NotesFieldsRHF,
} from "./ContentFieldsRHF";
import { SubjectiveEffectsFieldsRHF } from "./subjective-effects";
import { LegalityFieldsRHF } from "./LegalityFieldsRHF";
import { ReagentPreviewFieldsRHF } from "./ReagentPreviewFieldsRHF";
import { SourceCitationsFieldsRHF } from "./SourceCitationsFieldsRHF";
import { CitationsFieldsRHF } from "./CitationsFieldsRHF";
import { ReferencesFieldsRHF } from "./ReferencesFieldsRHF";
import { HistoryCultureFieldsRHF } from "./HistoryCultureFieldsRHF";
import { EditorialReviewFieldsRHF } from "./EditorialReviewFieldsRHF";
import { CollapsibleFormSectionCard } from "./FormHelpers";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
import { Icon } from "@/components/common/Icon";

export type ArticleDraftFormFieldsRHFProps = {
  idPrefix: string;
  article?: SubstanceArticle;
  onMutate?: () => void;
  formRef?: React.RefObject<UseArticleFormReturn | null>;
};

export function ArticleDraftFormFieldsRHF({
  idPrefix,
  article,
  onMutate,
  formRef,
}: ArticleDraftFormFieldsRHFProps) {
  const articleForm = useArticleForm({ article, onMutate });
  const { methods } = articleForm;

  // Published after commit, never during render: the save path reads this ref
  // and a render-phase write would hand it a form that never mounted.
  useEffect(() => {
    if (!formRef) {
      return undefined;
    }
    formRef.current = articleForm;
    return () => {
      formRef.current = null;
    };
  });

  const {
    categories: categoryOptions,
    chemicalClasses: chemicalClassOptions,
    psychoactiveClasses: psychoactiveClassOptions,
    mechanismOfAction: mechanismOptions,
    indexCategories: indexCategoryOptions,
  } = useDevTagOptions();

  // Apply drives `handleSubmit` through the form ref from the draft controller,
  // so the native submit only has to stay inert — an implicit submit from a
  // control without an explicit type must not reload the editor.
  const handleFormSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  }, []);

  return (
    <FormProvider {...methods}>
      <ArticleFormProvider value={articleForm}>
        <form className="space-y-3" noValidate onSubmit={handleFormSubmit}>
          {/* 1. Overview/Meta */}
          <CollapsibleFormSectionCard
            title="Overview"
            icon={<Icon icon="lucide:file-text" size={20} />}
            names={["id", "title", "priority", "index_categories", "identification"]}
          >
            <OverviewFieldsRHF
              idPrefix={idPrefix}
              categoryOptions={categoryOptions}
              indexCategoryOptions={indexCategoryOptions}
            />
          </CollapsibleFormSectionCard>
          {/* 2. Classification */}
          <CollapsibleFormSectionCard
            title="Classification"
            icon={<Icon icon="lucide:brain-cog" size={20} />}
            names="classification"
          >
            <ClassificationFieldsRHF
              chemicalClassOptions={chemicalClassOptions}
              psychoactiveClassOptions={psychoactiveClassOptions}
            />
          </CollapsibleFormSectionCard>
          {/* 3. Summary */}
          <CollapsibleFormSectionCard
            title="Summary"
            icon={<Icon icon="lucide:file-text" size={20} />}
            names="summary"
          >
            <NotesFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 4. Dosage & Duration */}
          <CollapsibleFormSectionCard
            title="Dosage & Duration"
            icon={<Icon icon="lucide:chart-no-axes-combined" size={20} />}
            names={["dosage", "duration"]}
          >
            <DosageDurationFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 5. Subjective Effects */}
          <CollapsibleFormSectionCard
            title="Subjective Effects"
            icon={<Icon icon="streamline-flex:critical-thinking-2" size={20} />}
            names="subjective_effects"
          >
            <SubjectiveEffectsFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 6. Reagent Testing (collapsed by default - read-only preview) */}
          <CollapsibleFormSectionCard
            title="Reagent Testing"
            icon={<Icon icon="lucide:pipette" size={20} />}
            names="reagent_testing"
          >
            <ReagentPreviewFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 7. Pharmacology */}
          <CollapsibleFormSectionCard
            title="Pharmacology"
            icon={<Icon icon="fa-solid:cogs" size={20} />}
            names="pharmacology"
          >
            <ChemistryFieldsRHF
              idPrefix={idPrefix}
              mechanismOptions={mechanismOptions}
            />
          </CollapsibleFormSectionCard>
          {/* 8. Interactions */}
          <CollapsibleFormSectionCard
            title="Interactions"
            icon={<Icon icon="lucide:blend" className="h-5 w-5" size={20} />}
            names="interactions"
          >
            <InteractionsFieldsRHF />
          </CollapsibleFormSectionCard>
          {/* 9. Tolerance */}
          <CollapsibleFormSectionCard
            title="Tolerance"
            icon={<Icon icon="lucide:trending-up" size={20} />}
            names="tolerance"
          >
            <ToleranceFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 10. Harm Potential */}
          <CollapsibleFormSectionCard
            title="Harm Potential"
            icon={<Icon icon="lucide:ambulance" size={20} />}
            names="harm_potential"
          >
            <AddictionFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 11. History & Culture */}
          <CollapsibleFormSectionCard
            title="History & Culture"
            icon={<Icon icon="lucide:book-open" className="h-5 w-5" size={20} />}
            names="history_culture"
          >
            <HistoryCultureFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 12. Legality (collapsed by default) */}
          <CollapsibleFormSectionCard
            title="Legality"
            icon={<Icon icon="lucide:scale" size={20} />}
            names="legality"
          >
            <LegalityFieldsRHF idPrefix={idPrefix} />
          </CollapsibleFormSectionCard>
          {/* 13. Structured References */}
          <CollapsibleFormSectionCard
            title="References"
            icon={<Icon icon="lucide:file-stack" size={20} />}
            names="references"
          >
            <ReferencesFieldsRHF />
          </CollapsibleFormSectionCard>
          {/* 14-16. Legacy + editor-only metadata, grouped and subdued so the
              tail sections carry less visual weight than the article content. */}
          <div className="space-y-2 pt-2">
            <p className="theme-text-faint text-[10px] font-medium uppercase tracking-wider">
              Legacy & internal
            </p>
            <CollapsibleEditorCard
              title="Legacy Source Links"
              icon={<Icon icon="lucide:library" size={16} />}
              density="compact"
            >
              <SourceCitationsFieldsRHF idPrefix={idPrefix} />
            </CollapsibleEditorCard>
            <CollapsibleEditorCard
              title="Legacy Further Reading"
              icon={<Icon icon="lucide:book-open" size={16} />}
              density="compact"
            >
              <CitationsFieldsRHF idPrefix={idPrefix} />
            </CollapsibleEditorCard>
            <CollapsibleEditorCard
              title="Editorial Review"
              icon={<Icon icon="lucide:list-checks" size={16} />}
              density="compact"
            >
              <EditorialReviewFieldsRHF idPrefix={idPrefix} slug={(article as SubstanceArticle & { slug?: string } | undefined)?.slug} />
            </CollapsibleEditorCard>
          </div>
        </form>
      </ArticleFormProvider>
    </FormProvider>
  );
}
