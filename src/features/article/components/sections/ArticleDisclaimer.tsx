"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";

export function ArticleDisclaimer({ text }: { text: string }) {
  const t = useT();
  if (!text.trim()) return null;

  return (
    <p className="theme-text-muted mb-3 flex items-start gap-2 text-xs leading-relaxed">
      <Icon icon="cuida:warning-outline" size={14} className="mt-0.5 shrink-0" />
      <span>{t(text)}</span>
    </p>
  );
}
