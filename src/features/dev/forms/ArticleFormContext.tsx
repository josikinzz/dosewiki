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

export function useArticleFormContext(): UseArticleFormReturn {
  const context = useContext(ArticleFormContext);
  if (!context) {
    throw new Error("useArticleFormContext must be used inside an ArticleFormProvider");
  }
  return context;
}
