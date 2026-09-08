"use client";

import { createContext, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { ARTICLE_SECTION_LABELS, type ArticleEditorSection } from "./ArticleSectionForm";

export const ArticleSectionEditorContext = createContext<((section: ArticleEditorSection) => void) | null>(null);
export default function ArticleSectionEditor({ section, missing = false, labeled = false }: { section: ArticleEditorSection; missing?: boolean; labeled?: boolean }) {
  const open = useContext(ArticleSectionEditorContext);
  if (!open) return null;
  const label = `${missing ? "Add" : "Edit"} ${ARTICLE_SECTION_LABELS[section].toLowerCase()}`;
  return <Button type="button" variant={labeled ? "outline" : "iconGhost"} size="sm" className={labeled ? "shrink-0" : `w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label={label} title={label} onClick={() => open(section)}>
    <Icon icon={missing ? "lucide:plus" : "lucide:pencil"} size={16} aria-hidden />
    {labeled && ARTICLE_SECTION_LABELS[section]}
  </Button>;
}
