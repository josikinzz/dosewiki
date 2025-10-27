import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { InfoSection } from "../../types/content";

type BulletEntry = {
  key: string;
  label: string;
  onClick?: () => void;
};

type ClassificationKind = "chemical" | "psychoactive";

const BULLET_LIST_LABELS = new Set([
  "chemical class",
  "mechanism of action",
  "psychoactive class",
  "half-life",
  "half life",
]);

const splitSemicolonEntries = (value: string) =>
  value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

interface InfoSectionsProps {
  sections: InfoSection[];
  onMechanismSelect?: (mechanismSlug: string, qualifierSlug?: string) => void;
  onClassificationSelect?: (classification: ClassificationKind, label: string) => void;
}

export function InfoSections({ sections, onMechanismSelect, onClassificationSelect }: InfoSectionsProps) {
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
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
          {orderedCards.map((item) => {
            const { label, value, href, icon: ItemIcon, chips } = item;
            const normalizedLabel = label.toLowerCase().trim();
            const isMechanism = normalizedLabel === "mechanism of action";
            const mechanismBadges = isMechanism ? chips ?? [] : [];
            const shouldRenderBullets = BULLET_LIST_LABELS.has(normalizedLabel);
            const classificationType: ClassificationKind | undefined = normalizedLabel === "chemical class"
              ? "chemical"
              : normalizedLabel === "psychoactive class"
                ? "psychoactive"
                : undefined;
            const linkClasses = "text-sm leading-snug text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline";
            const textClasses = "text-sm leading-snug text-white/85";
            const bulletEntries: BulletEntry[] = [];

            if (shouldRenderBullets) {
              if (mechanismBadges.length > 0) {
                mechanismBadges.forEach((badge) => {
                  const key = `${badge.slug}-${badge.qualifierSlug ?? ""}-${badge.label}`;
                  const onClick =
                    onMechanismSelect && badge.slug
                      ? () => onMechanismSelect(badge.slug, badge.qualifierSlug)
                      : undefined;

                  bulletEntries.push({
                    key,
                    label: badge.label,
                    onClick,
                  });
                });
              } else {
                const entries = splitSemicolonEntries(value);
                entries.forEach((entry, index) => {
                  const onClick = classificationType && onClassificationSelect
                    ? () => onClassificationSelect(classificationType, entry)
                    : undefined;
                  bulletEntries.push({
                    key: `${label}-${entry}-${index}`,
                    label: entry,
                    onClick,
                  });
                });
              }
            }

            const bulletListNode =
              bulletEntries.length > 0 ? (
                <ul className="space-y-2 text-sm leading-snug text-white/85">
                  {bulletEntries.map((entry) => (
                    <li key={entry.key} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                      {entry.onClick ? (
                        <button
                          type="button"
                          onClick={entry.onClick}
                          className="text-left text-fuchsia-200 underline-offset-4 transition hover:text-fuchsia-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                        >
                          {entry.label}
                        </button>
                      ) : (
                        <span className="text-white/85">{entry.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null;

            const valueNode = bulletListNode ?? (href ? (
              <a href={href} className={linkClasses} target="_blank" rel="noreferrer">
                {value}
              </a>
            ) : (
              <span className={textClasses}>{value}</span>
            ));

            return (
              <article
                key={`${label}-${value}`}
                className="mb-4 flex w-full flex-col gap-3 break-inside-avoid rounded-xl bg-white/5 px-4 py-4 text-white/85 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/20 last:mb-0"
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


