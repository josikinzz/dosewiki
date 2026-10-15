import { SmartLink } from "@/components/common/SmartLink";
import type { PublicTranslationCredit } from "@/data/content/translationCredits";
import { cn } from "@/lib/utils";

export function TranslationCredits({
  title,
  credits,
  className,
}: {
  title: string;
  credits: readonly PublicTranslationCredit[];
  className?: string;
}) {
  if (credits.length === 0) return null;
  return (
    <section aria-label={title} className={cn("space-y-2", className)}>
      <h2 className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">{title}</h2>
      <ul className="space-y-1">
        {credits.map((credit) => (
          <li key={credit.key} className="theme-text-secondary text-sm leading-6">
            {/^https?:\/\//i.test(credit.href) ? (
              <a className="theme-text-primary font-medium underline" href={credit.href} rel="noopener noreferrer" target="_blank">
                {credit.displayName}
              </a>
            ) : (
              <SmartLink className="theme-text-primary font-medium underline" href={credit.href}>
                {credit.displayName}
              </SmartLink>
            )}
            <span aria-hidden="true"> · </span>
            <span>{credit.contribution}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
