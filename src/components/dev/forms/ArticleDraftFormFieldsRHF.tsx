/**
 * React Hook Form-based article draft form fields.
 * Uses FormProvider for child components to access form context.
 */

import { FormProvider } from "react-hook-form";

import { useDevTagOptions } from "../../../hooks/useDevTagOptions";
import { useArticleForm, type UseArticleFormReturn } from "../../../hooks/useArticleForm";
import type { SubstanceArticle } from "../../../schema";

import { OverviewFieldsRHF } from "./OverviewFieldsRHF";
import { DosageDurationFieldsRHF } from "./DosageDurationFieldsRHF";
import { ChemistryFieldsRHF } from "./ChemistryFieldsRHF";
import {
  SubjectiveEffectsFieldsRHF,
  AddictionFieldsRHF,
  InteractionsFieldsRHF,
  ToleranceFieldsRHF,
  NotesFieldsRHF,
} from "./ContentFieldsRHF";
import { LegalityFieldsRHF } from "./LegalityFieldsRHF";
import { ReagentPreviewFieldsRHF } from "./ReagentPreviewFieldsRHF";
import { SourceCitationsFieldsRHF } from "./SourceCitationsFieldsRHF";
import { CitationsFieldsRHF } from "./CitationsFieldsRHF";
import { FormSectionCard } from "./FormHelpers";

export type ArticleDraftFormFieldsRHFProps = {
  idPrefix: string;
  article?: SubstanceArticle;
  onMutate?: () => void;
  formRef?: React.MutableRefObject<UseArticleFormReturn | null>;
};

export function ArticleDraftFormFieldsRHF({
  idPrefix,
  article,
  onMutate,
  formRef,
}: ArticleDraftFormFieldsRHFProps) {
  const articleForm = useArticleForm({ article, onMutate });
  const { methods, dosageRoutes, durationRoutes, sourceCitations, citations, addDosageRoute, removeDosageRoute, addSourceCitation, removeSourceCitation, addCitation, removeCitation, applyDurationFromRoute } = articleForm;

  // Expose form methods to parent via ref
  if (formRef) {
    formRef.current = articleForm;
  }

  const {
    categories: categoryOptions,
    chemicalClasses: chemicalClassOptions,
    psychoactiveClasses: psychoactiveClassOptions,
    mechanismOfAction: mechanismOptions,
    indexCategories: indexCategoryOptions,
  } = useDevTagOptions();

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <FormSectionCard>
          <OverviewFieldsRHF
            idPrefix={idPrefix}
            categoryOptions={categoryOptions}
            indexCategoryOptions={indexCategoryOptions}
          />
        </FormSectionCard>
        <FormSectionCard>
          <DosageDurationFieldsRHF
            idPrefix={idPrefix}
            dosageRoutes={dosageRoutes}
            durationRoutes={durationRoutes}
            addDosageRoute={addDosageRoute}
            removeDosageRoute={removeDosageRoute}
            applyDurationFromRoute={applyDurationFromRoute}
          />
        </FormSectionCard>
        <FormSectionCard>
          <ChemistryFieldsRHF
            idPrefix={idPrefix}
            chemicalClassOptions={chemicalClassOptions}
            psychoactiveClassOptions={psychoactiveClassOptions}
            mechanismOptions={mechanismOptions}
          />
        </FormSectionCard>
        <FormSectionCard>
          <AddictionFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <SubjectiveEffectsFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <InteractionsFieldsRHF />
        </FormSectionCard>
        <FormSectionCard>
          <ToleranceFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <LegalityFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <ReagentPreviewFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <NotesFieldsRHF idPrefix={idPrefix} />
        </FormSectionCard>
        <FormSectionCard>
          <SourceCitationsFieldsRHF
            idPrefix={idPrefix}
            sourceCitations={sourceCitations}
            addSourceCitation={addSourceCitation}
            removeSourceCitation={removeSourceCitation}
          />
        </FormSectionCard>
        <FormSectionCard>
          <CitationsFieldsRHF
            idPrefix={idPrefix}
            citations={citations}
            addCitation={addCitation}
            removeCitation={removeCitation}
          />
        </FormSectionCard>
      </div>
    </FormProvider>
  );
}
