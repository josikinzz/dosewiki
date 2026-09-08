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
 * in `useArticleForm`. It pairs routes during hydration and moves, renames and
 * removes both sides together. A second `useFieldArray` over the same names
 * would desynchronise them; section components consume this context instead.
 */
export function useArticleFormContext(): UseArticleFormReturn {
  const context = useContext(ArticleFormContext);
  if (!context) {
    throw new Error("useArticleFormContext must be used inside an ArticleFormProvider");
  }
  return context;
}
