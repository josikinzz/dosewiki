import { IconBadge } from "@/components/common/IconBadge";
import { Icon } from "@/components/common/Icon";
import { Bullet } from "@/components/common/Bullet";
import { Button } from "@/components/ui/button";
import type { InfoSection, InfoSectionItem } from "@/types/content";

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
  layoutVariant?: "two-column" | "single-column";
}

interface InfoSectionItemCardProps {
  item: InfoSectionItem;
  onMechanismSelect?: (mechanismSlug: string, qualifierSlug?: string) => void;
  onClassificationSelect?: (classification: ClassificationKind, label: string) => void;
  headingClassName?: string;
}

export function InfoSectionItemCard({
  item,
  onMechanismSelect,
  onClassificationSelect,
  headingClassName,
}: InfoSectionItemCardProps) {
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
            <Bullet />
            {entry.onClick ? (
              <Button
                variant="link"
                size="auto"
                className="text-left"
                onClick={entry.onClick}
              >
                {entry.label}
              </Button>
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

  const mergedHeadingClasses = headingClassName ?? "flex items-center gap-2 text-base font-semibold leading-tight text-fuchsia-300";

  return (
    <article className="flex w-full flex-col gap-3 rounded-2xl bg-white/[0.03] px-4 py-4 text-white/85 ring-1 ring-white/5 transition hover:bg-white/10 hover:ring-white/20">
      <h3 className={mergedHeadingClasses}>
        {ItemIcon ? <Icon icon={ItemIcon} size={20} className="text-fuchsia-300" /> : null}
        <span>{label}</span>
      </h3>
      <div>{valueNode}</div>
    </article>
  );
}

export function InfoSections({
  sections,
  onMechanismSelect,
  onClassificationSelect,
  layoutVariant = "two-column",
}: InfoSectionsProps) {
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

  const leftColumnLabels = new Set(["chemical class", "substitutive name", "iupac name"]);
  const rightColumnLabels = new Set(["psychoactive class", "mechanism of action", "half-life", "half life"]);

  const leftColumnItems: typeof orderedCards = [];
  const rightColumnItems: typeof orderedCards = [];
  const remainingItems: typeof orderedCards = [];

  orderedCards.forEach((item) => {
    const normalizedLabel = item.label.toLowerCase().trim();
    if (leftColumnLabels.has(normalizedLabel)) {
      leftColumnItems.push(item);
      return;
    }

    if (rightColumnLabels.has(normalizedLabel)) {
      rightColumnItems.push(item);
      return;
    }

    remainingItems.push(item);
  });

  remainingItems.forEach((item) => {
    if (leftColumnItems.length <= rightColumnItems.length) {
      leftColumnItems.push(item);
    } else {
      rightColumnItems.push(item);
    }
  });

  const headingIcon = sections[0]?.icon;

  const renderColumns = () => {
    if (layoutVariant === "single-column") {
      const combinedItems = [...leftColumnItems, ...rightColumnItems];
      if (combinedItems.length === 0) {
        return null;
      }

      return (
        <div className="space-y-4">
          {combinedItems.map((item) => (
            <InfoSectionItemCard
              key={`${item.label}-${item.value}`}
              item={item}
              onMechanismSelect={onMechanismSelect}
              onClassificationSelect={onClassificationSelect}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="space-y-4">
          {leftColumnItems.map((item) => (
            <InfoSectionItemCard
              key={`${item.label}-${item.value}`}
              item={item}
              onMechanismSelect={onMechanismSelect}
              onClassificationSelect={onClassificationSelect}
            />
          ))}
        </div>
        <div className="space-y-4">
          {rightColumnItems.map((item) => (
            <InfoSectionItemCard
              key={`${item.label}-${item.value}`}
              item={item}
              onMechanismSelect={onMechanismSelect}
              onClassificationSelect={onClassificationSelect}
            />
          ))}
        </div>
      </div>
    );
  };

  const content = renderColumns();

  if (!content) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
            {headingIcon ? (
              <IconBadge icon={headingIcon} />
            ) : null}
            Chemistry & Pharmacology
          </h2>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
      </div>
      {content}
    </div>
  );
}
