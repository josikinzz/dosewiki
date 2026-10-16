import type { IconName } from "@/components/common/Icon";
import {
  IndexCard,
  IndexCardList,
  IndexCardListItem,
  IndexCardSection,
} from "@/components/common/IndexCard";
import { cn } from "@/lib/utils";
import { resolveEffectCategoryIcon } from "../../pages/effectsIndexConfig";
import { countVCodePanelRows, type VCodePanelSection } from "../panelModel";
import { resolveInternalHref } from "./IntLink";

const PANEL_CATEGORIES_BY_SOURCE_FILE: Record<string, string> = {
  "eye.svg": "visual",
  "user.svg": "cognitive",
  "child.svg": "physical",
  "cogs.svg": "multisensory",
};

const FALLBACK_PANEL_ICON: IconName = "lucide:layout-list";

export function resolveEffectListPanelIcon(title: string, sourceIcon?: string): IconName {
  const categoryIcon = resolveEffectCategoryIcon(
    title.trim().toLowerCase() === "other" ? "multisensory" : title,
  );
  if (categoryIcon) return categoryIcon;

  const sourceFile = sourceIcon?.trim().toLowerCase() ?? "";
  const sourceCategory = Object.prototype.hasOwnProperty.call(PANEL_CATEGORIES_BY_SOURCE_FILE, sourceFile)
    ? PANEL_CATEGORIES_BY_SOURCE_FILE[sourceFile]
    : undefined;
  return (
    (sourceCategory ? resolveEffectCategoryIcon(sourceCategory) : undefined) ??
    FALLBACK_PANEL_ICON
  );
}

interface EffectListPanelProps {
  id?: string;
  title: string;
  sourceIcon?: string;
  sections: VCodePanelSection[];
  sectionIds?: (string | undefined)[];
}

export function EffectListPanel({
  id,
  title,
  sourceIcon,
  sections,
  sectionIds,
}: EffectListPanelProps) {
  const isSectioned = sections.some((section) => Boolean(section.title));

  return (
    <div id={id} className={cn("not-prose", id && "scroll-mt-24")}>
      <IndexCard
        title={title}
        icon={resolveEffectListPanelIcon(title, sourceIcon)}
        count={countVCodePanelRows(sections)}
      >
        {sections.map((section, sectionIndex) => (
          <IndexCardSection
            key={section.title ?? sectionIndex}
            id={sectionIds?.[sectionIndex]}
            title={section.title}
            count={isSectioned ? section.rows.length : undefined}
            titleHref={
              section.titleHref ? resolveInternalHref(section.titleHref) : undefined
            }
            showDivider={sectionIndex > 0}
          >
            <IndexCardList>
              {section.rows.flatMap((row) => [
                <IndexCardListItem
                  key={`${row.href}-${row.label}`}
                  label={row.label}
                  href={resolveInternalHref(row.href)}
                  meta={row.meta}
                />,
                ...(row.children ?? []).map((child) => (
                  <IndexCardListItem
                    key={`${child.href}-${child.label}`}
                    label={child.label}
                    href={resolveInternalHref(child.href)}
                    meta={child.meta}
                    depth={1}
                  />
                )),
              ])}
            </IndexCardList>
          </IndexCardSection>
        ))}
      </IndexCard>
    </div>
  );
}
