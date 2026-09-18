"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExpandButton } from "@/components/common/ExpandButton";
import { FormProvider, useWatch, type FieldPath } from "react-hook-form";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import { buildDevTagOptions } from "@/hooks/useDevTagOptions";
import type { SubstanceArticle } from "@/schema";
import { articleValidationIssues } from "./useArticleLifecycle";
import { CITE_TOKEN_PATTERN } from "@/lib/citations/citationTokens";
import { ArticleFormProvider } from "@/features/dev/forms/ArticleFormContext";
import { OverviewFieldsRHF } from "@/features/dev/forms/OverviewFieldsRHF";
import { ClassificationFieldsRHF } from "@/features/dev/forms/ClassificationFieldsRHF";
import { DosageDurationFieldsRHF } from "@/features/dev/forms/DosageDurationFieldsRHF";
import { SubjectiveEffectsFieldsRHF } from "@/features/dev/forms/subjective-effects";
import { ChemistryFieldsRHF } from "@/features/dev/forms/ChemistryFieldsRHF";
import { AddictionFieldsRHF, InteractionsFieldsRHF, ToleranceFieldsRHF, NotesFieldsRHF } from "@/features/dev/forms/ContentFieldsRHF";
import { HistoryCultureFieldsRHF } from "@/features/dev/forms/HistoryCultureFieldsRHF";
import { LegalityFieldsRHF } from "@/features/dev/forms/LegalityFieldsRHF";
import { ReferencesFieldsRHF } from "@/features/dev/forms/ReferencesFieldsRHF";
import { ReagentPreviewFieldsRHF } from "@/features/dev/forms/ReagentPreviewFieldsRHF";
import { ComparisonsFieldsRHF } from "@/features/dev/forms/ComparisonsFieldsRHF";

export const ARTICLE_SECTION_LABELS = {
  summary: "Summary", identification: "Identification", classification: "Classification",
  dosage: "Dosage and duration", subjective_effects: "Subjective effects", comparisons: "Comparisons",
  reagent_testing: "Reagent testing", pharmacology: "Pharmacology", interactions: "Interactions",
  tolerance: "Tolerance", harm_potential: "Harm potential", history_culture: "History and culture",
  legality: "Legality", references: "References",
} as const;
export type ArticleEditorSection = keyof typeof ARTICLE_SECTION_LABELS;
export type SectionFormHandle = { collect: () => Promise<SubstanceArticle> };

export function ArticleSectionForm({ section, article, slug, form, handleRef }: {
  section: ArticleEditorSection; article: SubstanceArticle; slug: string;
  form: UseArticleFormReturn;
  handleRef: React.RefObject<SectionFormHandle | null>;
}) {
  const { methods } = form;
  const [referencesExpanded, setReferencesExpanded] = useState(false);
  const references = useWatch({ control: methods.control, name: "references" });
  const options = useMemo(() => buildDevTagOptions([article]), [article]);
  const initial = useRef(article);
  const formElement = useRef<HTMLFormElement>(null);
  useEffect(() => {
    handleRef.current = { collect: async () => {
      // Range editors retain unparseable text outside the normalized article.
      // Commit the active field's blur before checking its native validity.
      const activeField = document.activeElement;
      if (activeField instanceof HTMLElement && formElement.current?.contains(activeField)) activeField.blur();
      const invalidField = formElement.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:invalid, textarea:invalid, select:invalid");
      if (invalidField) {
        setReferencesExpanded(true);
        requestAnimationFrame(() => invalidField.focus());
        throw new Error(invalidField.validationMessage);
      }
      const values = methods.getValues();
      // Only actual form changes become a patch; default fillers in unrelated
      // sections never hitchhike on a one-section correction.
      const next = { ...article };
      const referencesChanged = JSON.stringify(values.references) !== JSON.stringify(initial.current.references);
      for (const key of Object.keys(values) as (keyof SubstanceArticle)[]) {
        if (key.startsWith("_") || key === "editorial_review") continue;
        const allowed = key === section || key === "references" || (section === "dosage" && key === "duration") || (section === "identification" && key === "title");
        // Reference removal can clean markers across prose as one coherent edit.
        const citationCleanup = referencesChanged && JSON.stringify(values[key])?.replace(CITE_TOKEN_PATTERN, "") === JSON.stringify(initial.current[key])?.replace(CITE_TOKEN_PATTERN, "");
        if ((allowed || section === "references" || citationCleanup) && JSON.stringify(values[key]) !== JSON.stringify(initial.current[key])) {
          Object.assign(next, { [key]: values[key] });
        }
      }
      methods.clearErrors();
      const issues = articleValidationIssues(next, article, false);
      for (const issue of issues) methods.setError(issue.path as FieldPath<SubstanceArticle>, { type: "validate", message: issue.message });
      if (issues.some(issue => issue.path === "references" || issue.path.startsWith("references."))) setReferencesExpanded(true);
      if (issues.length) throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      return next;
    } };
    // The account-bound parent owns the form, including while its UI is concealed.
  }, [article, section, methods, handleRef]);
  const prefix = `context-${section}`;
  const citationGuidanceId = `${prefix}-citation-guidance`;
  const referencesId = `${prefix}-references`;
  let fields;
  switch (section) {
    case "summary": fields = <NotesFieldsRHF idPrefix={prefix} describedBy={citationGuidanceId} />; break;
    case "identification": fields = <><OverviewFieldsRHF idPrefix={prefix} categoryOptions={options.categories} indexCategoryOptions={options.indexCategories} identificationOnly /><p className="theme-text-muted text-sm">Structure drawings remain in the specialist molecule editor.</p><Button asChild variant="outline"><Link href={`/dev/molecule-editor/${encodeURIComponent(slug)}`}>Open molecule editor</Link></Button></>; break;
    case "classification": fields = <><p className="theme-text-muted max-w-prose text-sm">This changes this substance's classification and derived index membership. Shared taxonomy names and other substances are unchanged. Suggestions come from this article only.</p><ClassificationFieldsRHF chemicalClassOptions={options.chemicalClasses} psychoactiveClassOptions={options.psychoactiveClasses} /></>; break;
    case "dosage": fields = <DosageDurationFieldsRHF idPrefix={prefix} />; break;
    case "subjective_effects": fields = <SubjectiveEffectsFieldsRHF idPrefix={prefix} pairedIndicator />; break;
    case "comparisons": fields = <ComparisonsFieldsRHF />; break;
    case "reagent_testing": fields = <ReagentPreviewFieldsRHF idPrefix={prefix} />; break;
    case "pharmacology": fields = <ChemistryFieldsRHF idPrefix={prefix} mechanismOptions={options.mechanismOfAction} />; break;
    case "interactions": fields = <><p className="theme-text-muted text-sm">Article-specific interaction notes only; shared interaction taxonomy and reciprocal articles are unchanged.</p><InteractionsFieldsRHF embedded /></>; break;
    case "tolerance": fields = <ToleranceFieldsRHF idPrefix={prefix} embedded />; break;
    case "harm_potential": fields = <AddictionFieldsRHF idPrefix={prefix} pairedIndicator />; break;
    case "history_culture": fields = <HistoryCultureFieldsRHF idPrefix={prefix} embedded />; break;
    case "legality": fields = <LegalityFieldsRHF idPrefix={prefix} embedded />; break;
    case "references": fields = null; break;
  }
  return <FormProvider {...methods}><ArticleFormProvider value={form}>
    <form ref={formElement} className="space-y-6" onSubmit={(event) => event.preventDefault()}>
      {fields}
      {section !== "references" && <p id={citationGuidanceId} className="theme-text-muted text-sm">Preserve stable [cite:reference-id] markers. Changed claims require a support recheck; an existing marker does not certify new wording.</p>}
      {section !== "references" ? (
        <section className="space-y-4">
          <ExpandButton
            variant="inline"
            className="min-h-11 w-full justify-between gap-3 text-sm font-semibold before:inset-0"
            isExpanded={referencesExpanded}
            onToggle={() => setReferencesExpanded((value) => !value)}
            label={`References and citation checks (${references?.length ?? 0})`}
            ariaLabel="References and citation checks"
            ariaControls={referencesId}
          />
          <div id={referencesId} hidden={!referencesExpanded}>
            <ReferencesFieldsRHF embedded />
          </div>
        </section>
      ) : <ReferencesFieldsRHF embedded />}
    </form>
  </ArticleFormProvider></FormProvider>;
}
