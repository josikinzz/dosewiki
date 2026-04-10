import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ManualChemicalIndexConfig,
  ManualMechanismIndexConfig,
  ManualPsychoactiveIndexConfig,
} from "./devModeTypes";
import { deepClone } from "./devModeUtils";

function useManualIndexState<T>(source: T) {
  const originalRef = useRef<T>(deepClone(source));
  const [value, setValue] = useState<T>(() => deepClone(originalRef.current));

  useEffect(() => {
    originalRef.current = deepClone(source);
    setValue(deepClone(source));
  }, [source]);

  const replace = useCallback((nextConfig: T) => {
    setValue(deepClone(nextConfig));
  }, []);

  const reset = useCallback(() => {
    setValue(deepClone(originalRef.current));
  }, []);

  const getOriginal = useCallback(() => deepClone(originalRef.current), []);

  const applyTransform = useCallback((transform: (previous: T) => T) => {
    setValue((previous) => deepClone(transform(previous)));
  }, []);

  return { applyTransform, getOriginal, replace, reset, value };
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
    applyChemicalIndexManualTransform: chemical.applyTransform,
    applyMechanismIndexManualTransform: mechanism.applyTransform,
    applyPsychoactiveIndexManualTransform: psychoactive.applyTransform,
    chemicalIndexManual: chemical.value,
    getOriginalChemicalIndexManual: chemical.getOriginal,
    getOriginalMechanismIndexManual: mechanism.getOriginal,
    getOriginalPsychoactiveIndexManual: psychoactive.getOriginal,
    mechanismIndexManual: mechanism.value,
    psychoactiveIndexManual: psychoactive.value,
    replaceChemicalIndexManual: chemical.replace,
    replaceMechanismIndexManual: mechanism.replace,
    replacePsychoactiveIndexManual: psychoactive.replace,
    resetChemicalIndexManual: chemical.reset,
    resetMechanismIndexManual: mechanism.reset,
    resetPsychoactiveIndexManual: psychoactive.reset,
  };
}
