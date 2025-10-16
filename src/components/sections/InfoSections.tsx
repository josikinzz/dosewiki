import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { BADGE_BASE_CLASSES, BADGE_INTERACTIVE_CLASSES } from "../common/badgeStyles";
import type { InfoSection } from "../../types/content";

interface InfoSectionsProps {
  sections: InfoSection[];
  onMechanismSelect?: (mechanismSlug: string, qualifierSlug?: string) => void;
}

export function InfoSections({ sections, onMechanismSelect }: InfoSectionsProps) {
  if (!sections || sections.length === 0) {
    return null;
  }

  const cards = sections.flatMap((section) => section.items ?? []);

  const filteredCards = cards.filter((item) => {
    const normalizedLabel = item.label.toLowerCase().trim();
    return normalizedLabel ? !normalizedLabel.includes("category") : true;
  });

  if (filteredCards.length === 0) {
    return null;
  }

  const normalizeLabel = (value: string) => value.toLowerCase().trim();
  const prioritizedLabels = ["chemical class", "mechanism of action"];
  const prioritizedCards = prioritizedLabels
    .map((label) => filteredCards.find((item) => normalizeLabel(item.label) === label))
    .filter((item): item is typeof filteredCards[number] => Boolean(item));
  const prioritizedSet = new Set(prioritizedCards);
  const orderedCards = [
    ...prioritizedCards,
    ...filteredCards.filter((item) => !prioritizedSet.has(item)),
  ];

  const headingIcon = sections[0]?.icon;

  return (
    <SectionCard delay={0.08}>
      <div className="flex flex-col gap-6">
        <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
          {headingIcon ? (
            <IconBadge icon={headingIcon} label="Chemistry and pharmacology" />
          ) : null}
          Chemistry & Pharmacology
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedCards.map((item) => {
            const { label, value, href, icon: ItemIcon, chips } = item;
            const normalizedLabel = label.toLowerCase().trim();
            const isMechanism = normalizedLabel === "mechanism of action";
            const mechanismBadges = isMechanism ? chips ?? [] : [];
            const linkClasses = "text-sm leading-snug text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline";
            const textClasses = "text-sm leading-snug text-white/85";
            const valueNode = mechanismBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {mechanismBadges.map((badge) => {
                  const isInteractive = Boolean(onMechanismSelect && badge.slug);
                  const key = `${badge.slug}-${badge.qualifierSlug ?? ""}-${badge.label}`;

                  if (!isInteractive) {
                    return (
                      <span key={key} className={BADGE_BASE_CLASSES}>
                        {badge.label}
                      </span>
                    );
                  }

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onMechanismSelect?.(badge.slug, badge.qualifierSlug)}
                      className={BADGE_INTERACTIVE_CLASSES}
                    >
                      {badge.label}
                    </button>
                  );
                })}
              </div>
            ) : href ? (
              <a href={href} className={linkClasses} target="_blank" rel="noreferrer">
                {value}
              </a>
            ) : (
              <span className={textClasses}>{value}</span>
            );

            return (
              <article
                key={`${label}-${value}`}
                className="flex h-full flex-col gap-3 rounded-xl bg-white/5 px-4 py-4 text-white/85 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/20"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold leading-tight text-white">
                  {ItemIcon ? <ItemIcon className="h-4 w-4 text-fuchsia-200" aria-hidden="true" focusable="false" /> : null}
                  <span>{label}</span>
                </h3>
                <div>{valueNode}</div>
              </article>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}


