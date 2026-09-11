"use client";

import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";

/**
 * The muted caveat line that sits above a set of numbers an editor wants read
 * as approximate — the dose tier ladder, the tolerance timings.
 *
 * One component rather than one per section: the two are the same statement in
 * two places, and a reader who learns to recognise the glyph should not have to
 * relearn it a section later. Blank body renders nothing at all, so an editor
 * who empties the copy block drops the line instead of leaving a bare glyph
 * behind.
 */
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
