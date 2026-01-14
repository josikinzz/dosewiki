/**
 * React Hook Form-based article draft form fields.
 * Uses FormProvider for child components to access form context.
 */

import { FormProvider } from "react-hook-form";

import { useDevTagOptions } from "../../../hooks/useDevTagOptions";
import { useArticleForm, type UseArticleFormReturn } from "../../../hooks/useArticleForm";
import type { SubstanceArticle } from "../../../schema";

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
import { HistoryCultureFieldsRHF } from "./HistoryCultureFieldsRHF";
import { CollapsibleFormSectionCard } from "./FormHelpers";
import {
  FileText,
  BrainCog,
  ChartNoAxesCombined,
  Sparkles,
  Pipette,
  UserRoundCog,
  Blend,
  TrendingUp,
  Ambulance,
  BookOpen,
  Scale,
  Library,
} from "lucide-react";

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
        {/* 1. Overview/Meta */}
        <CollapsibleFormSectionCard
          title="Overview"
          icon={<FileText className="h-5 w-5" />}
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
          icon={<BrainCog className="h-5 w-5" />}
        >
          <ClassificationFieldsRHF
            chemicalClassOptions={chemicalClassOptions}
            psychoactiveClassOptions={psychoactiveClassOptions}
          />
        </CollapsibleFormSectionCard>
        {/* 3. Summary */}
        <CollapsibleFormSectionCard
          title="Summary"
          icon={<FileText className="h-5 w-5" />}
        >
          <NotesFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 4. Dosage & Duration */}
        <CollapsibleFormSectionCard
          title="Dosage & Duration"
          icon={<ChartNoAxesCombined className="h-5 w-5" />}
        >
          <DosageDurationFieldsRHF
            idPrefix={idPrefix}
            dosageRoutes={dosageRoutes}
            durationRoutes={durationRoutes}
            addDosageRoute={addDosageRoute}
            removeDosageRoute={removeDosageRoute}
            applyDurationFromRoute={applyDurationFromRoute}
          />
        </CollapsibleFormSectionCard>
        {/* 5. Subjective Effects */}
        <CollapsibleFormSectionCard
          title="Subjective Effects"
          icon={<Sparkles className="h-5 w-5" />}
        >
          <SubjectiveEffectsFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 6. Reagent Testing (collapsed by default - read-only preview) */}
        <CollapsibleFormSectionCard
          title="Reagent Testing"
          icon={<Pipette className="h-5 w-5" />}
        >
          <ReagentPreviewFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 7. Pharmacology */}
        <CollapsibleFormSectionCard
          title="Pharmacology"
          icon={<UserRoundCog className="h-5 w-5" />}
        >
          <ChemistryFieldsRHF
            idPrefix={idPrefix}
            mechanismOptions={mechanismOptions}
          />
        </CollapsibleFormSectionCard>
        {/* 8. Interactions */}
        <CollapsibleFormSectionCard
          title="Interactions"
          icon={<Blend className="h-5 w-5" />}
        >
          <InteractionsFieldsRHF />
        </CollapsibleFormSectionCard>
        {/* 9. Tolerance */}
        <CollapsibleFormSectionCard
          title="Tolerance"
          icon={<TrendingUp className="h-5 w-5" />}
        >
          <ToleranceFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 10. Harm Potential */}
        <CollapsibleFormSectionCard
          title="Harm Potential"
          icon={<Ambulance className="h-5 w-5" />}
        >
          <AddictionFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 11. History & Culture */}
        <CollapsibleFormSectionCard
          title="History & Culture"
          icon={<BookOpen className="h-5 w-5" />}
        >
          <HistoryCultureFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 12. Legality (collapsed by default) */}
        <CollapsibleFormSectionCard
          title="Legality"
          icon={<Scale className="h-5 w-5" />}
        >
          <LegalityFieldsRHF idPrefix={idPrefix} />
        </CollapsibleFormSectionCard>
        {/* 13. Source Citations (collapsed by default) */}
        <CollapsibleFormSectionCard
          title="Sources"
          icon={<BookOpen className="h-5 w-5" />}
        >
          <SourceCitationsFieldsRHF
            idPrefix={idPrefix}
            sourceCitations={sourceCitations}
            addSourceCitation={addSourceCitation}
            removeSourceCitation={removeSourceCitation}
          />
        </CollapsibleFormSectionCard>
        {/* 14. Further Reading (collapsed by default) */}
        <CollapsibleFormSectionCard
          title="Citations"
          icon={<Library className="h-5 w-5" />}
        >
          <CitationsFieldsRHF
            idPrefix={idPrefix}
            citations={citations}
            addCitation={addCitation}
            removeCitation={removeCitation}
          />
        </CollapsibleFormSectionCard>
      </div>
    </FormProvider>
  );
}
