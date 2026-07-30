import { createContext, useContext, type ReactNode } from "react";

import type { UseArticleFormReturn } from "@/hooks/useArticleForm";

const ArticleFormContext = createContext<UseArticleFormReturn | null>(null);

export type ArticleFormProviderProps = {
  value: UseArticleFormReturn;
  children: ReactNode;
};

export function ArticleFormProvider({ value, children }: ArticleFormProviderProps) {
  return <ArticleFormContext.Provider value={value}>{children}</ArticleFormContext.Provider>;
}

/**
 * Shared field arrays and the paired dosage/duration helpers stay single-sourced
 * in `useArticleForm` — the sync effect there rebuilds duration from dosage by
 * index, so a second `useFieldArray` over the same names would desynchronise the
 * pairing. Section components read them from here instead of taking them as props.
 */
export function useArticleFormContext(): UseArticleFormReturn {
  const context = useContext(ArticleFormContext);
  if (!context) {
    throw new Error("useArticleFormContext must be used inside an ArticleFormProvider");
  }
  return context;
}
