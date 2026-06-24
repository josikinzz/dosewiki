import { memo, type ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/common/Icon";
import type { TripReportSubject, TripReportSubstance } from "@/types/tripReport";

interface ReportDossierProps {
  subject: TripReportSubject;
  substances: TripReportSubstance[];
  /** Map of substance name -> public article href, for substances that resolve
   *  to a known article. Resolved chips link to the article; the rest stay
   *  static text. */
  substanceLinks?: Record<string, string>;
}

interface FieldConfig {
  key: keyof TripReportSubject;
  label: string;
  icon: IconName;
}

const FIELD_CONFIG: FieldConfig[] = [
  { key: "age", label: "Age", icon: "lucide:user-circle" },
  { key: "gender", label: "Gender", icon: "lucide:user" },
  { key: "height", label: "Height", icon: "lucide:ruler" },
  { key: "weight", label: "Weight", icon: "lucide:scale" },
  { key: "medications", label: "Medications", icon: "lucide:pill" },
  { key: "setting", label: "Setting", icon: "lucide:map-pin" },
];

/**
 * Single quiet "fact sheet" strip combining the substances taken and the
 * subject context. Uses the dark chrome/inset tone so it reads as reference
 * material, visually subordinate to the narrative below it.
 */
export const ReportDossier = memo(function ReportDossier({
  subject,
  substances,
  substanceLinks,
}: ReportDossierProps) {
  const visibleFields = FIELD_CONFIG.filter(({ key }) => {
    const value = subject[key];
    return value && value.toString().trim().length > 0;
  });

  const hasSubstances = substances.length > 0;

  if (!hasSubstances && visibleFields.length === 0 && !subject.pdf_url) {
    return null;
  }

  return (
    <section className="theme-report-dossier rounded-2xl px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3">
        {hasSubstances ? (
          <div className="flex flex-wrap items-center gap-2">
            {substances.map((substance, index) => {
              const href = substanceLinks?.[substance.name];
              const inner: ReactNode = (
                <>
                  <Icon icon="lucide:beaker" size={14} className="theme-icon-accent shrink-0" />
                  <span className="theme-text-primary font-semibold">{substance.name}</span>
                  {substance.dose ? (
                    <span className="theme-text-secondary font-mono text-xs">{substance.dose}</span>
                  ) : null}
                  {substance.roa ? (
                    <span className="theme-text-muted text-xs">{substance.roa}</span>
                  ) : null}
                </>
              );

              const baseClass =
                "theme-report-dossier-substance inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm";

              return href ? (
                <Link
                  key={`${substance.name}-${index}`}
                  href={href}
                  title={`Read the ${substance.name} article`}
                  className={`${baseClass} transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong [@media(hover:hover)]:hover:shadow-[0_0_0_1px_var(--theme-accent)]`}
                >
                  {inner}
                  <Icon
                    icon="lucide:arrow-up-right"
                    size={13}
                    className="theme-icon-accent shrink-0 opacity-70"
                  />
                </Link>
              ) : (
                <span key={`${substance.name}-${index}`} className={baseClass}>
                  {inner}
                </span>
              );
            })}
          </div>
        ) : null}

        {visibleFields.length > 0 ? (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            {visibleFields.map(({ key, label, icon }) => (
              <div key={key} className="flex min-w-0 items-baseline gap-1.5">
                <dt className="theme-text-muted flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">
                  <Icon icon={icon} size={12} className="shrink-0 self-center" />
                  {label}
                </dt>
                <dd className="theme-text-secondary min-w-0 break-words">{subject[key]}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {subject.pdf_url ? (
          <a
            href={subject.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-link-muted inline-flex w-fit items-center gap-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
          >
            <Icon icon="lucide:external-link" className="h-4 w-4" />
            Subjective Effect Tracker PDF
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </section>
  );
});
