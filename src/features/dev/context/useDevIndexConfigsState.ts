import type {
  ManualChemicalIndexConfig,
  ManualMechanismIndexConfig,
  ManualPsychoactiveIndexConfig,
} from "./devModeTypes";
import { useEditorDocument } from "./editorDocumentSession";

function useManualIndexState<T>(source: T) {
  const document = useEditorDocument(source);

  return {
    isDirty: document.isDirty,
    applyTransform: document.applyDraftTransform,
    getOriginal: document.getOriginal,
    markSaved: document.markSaved,
    replace: document.replaceDraft,
    reset: document.reset,
    value: document.draft,
  };
}

export function useDevIndexConfigsState({
  chemicalSource,
  mechanismSource,
  psychoactiveSource,
}: {
  chemicalSource: ManualChemicalIndexConfig;
  mechanismSource: ManualMechanismIndexConfig;
  psychoactiveSource: ManualPsychoactiveIndexConfig;
}) {
  const psychoactive = useManualIndexState(psychoactiveSource);
  const chemical = useManualIndexState(chemicalSource);
  const mechanism = useManualIndexState(mechanismSource);

  return {
    hasUnsavedIndexChanges: psychoactive.isDirty || chemical.isDirty || mechanism.isDirty,
    applyChemicalIndexManualTransform: chemical.applyTransform,
    applyMechanismIndexManualTransform: mechanism.applyTransform,
    applyPsychoactiveIndexManualTransform: psychoactive.applyTransform,
    chemicalIndexManual: chemical.value,
    getOriginalChemicalIndexManual: chemical.getOriginal,
    getOriginalMechanismIndexManual: mechanism.getOriginal,
    getOriginalPsychoactiveIndexManual: psychoactive.getOriginal,
    mechanismIndexManual: mechanism.value,
    markIndexManualsSaved: () => {
      psychoactive.markSaved();
      chemical.markSaved();
      mechanism.markSaved();
    },
    psychoactiveIndexManual: psychoactive.value,
    replaceChemicalIndexManual: chemical.replace,
    replaceMechanismIndexManual: mechanism.replace,
    replacePsychoactiveIndexManual: psychoactive.replace,
    resetChemicalIndexManual: chemical.reset,
    resetMechanismIndexManual: mechanism.reset,
    resetPsychoactiveIndexManual: psychoactive.reset,
  };
}
