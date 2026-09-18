import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import { msg } from "@/i18n/messages";
import type { SubstanceArticle } from "@/schema";
import { slugify } from "@/utils/slug";
import { CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { INTERACTION_TIERS } from "./interactionTierLabels";
import {
  InteractionsSectionView,
  InteractionsSourceFooter,
  type InteractionGroup,
} from "./InteractionsSectionView.client";

interface InteractionsSectionProps {
  article: SubstanceArticle;
  linkableSubstanceSlugs?: readonly string[];
  onSelectInteraction?: (substance: string) => void;
}
type InteractionTierKey = (typeof INTERACTION_TIERS)[number]["key"];
const PRESENTATION: Record<
  InteractionTierKey,
  {
    icon: IconName;
    borderClass: string;
    bgClass: string;
    iconClass: string;
    priority: string;
    badgeClass: string;
    definition: string;
  }
> = {
  dangerous: {
    icon: "lucide:skull",
    borderClass: "theme-interaction-danger",
    bgClass: "",
    iconClass: "text-[color:var(--theme-semantic-danger-badge-text)]",
    priority: msg("Highest risk"),
    badgeClass: "theme-interaction-severity-badge-danger",
    definition: msg(
      "These combinations are considered extremely harmful and should always be avoided. Reactions to these drugs taken in combination are highly unpredictable and have a potential to cause death.",
    ),
  },
  unsafe: {
    icon: "lucide:hospital",
    borderClass: "theme-interaction-unsafe",
    bgClass: "",
    iconClass: "text-[color:var(--theme-semantic-unsafe-badge-text)]",
    priority: msg("Avoid"),
    badgeClass: "theme-interaction-severity-badge-unsafe",
    definition: msg(
      "There is considerable risk of physical harm when taking these combinations, they should be avoided where possible.",
    ),
  },
  caution: {
    icon: "lucide:triangle-alert",
    borderClass: "theme-interaction-caution",
    bgClass: "",
    iconClass: "text-[color:var(--theme-semantic-caution-badge-text)]",
    priority: msg("Use caution"),
    badgeClass: "theme-interaction-severity-badge-caution",
    definition: msg(
      "These combinations are not usually physically harmful, but may produce undesirable effects, such as physical discomfort or overstimulation. Extreme use may cause physical health issues. Synergistic effects may be unpredictable. Care should be taken when choosing to use this combination.",
    ),
  },
};

export const InteractionsSection = memo(function InteractionsSection({
  article,
  linkableSubstanceSlugs = [],
  onSelectInteraction,
}: InteractionsSectionProps) {
  const linkable = new Set(linkableSubstanceSlugs);
  const parseItems = (items: string[]) =>
    items.map((raw) => {
      const match = raw.match(/^(.+?)\s*[(（](.+)[)）]$/);
      const substance = match ? match[1].trim() : raw;
      const rationale = match ? match[2].trim() : null;
      const substanceSlug = slugify(substance);
      return {
        raw,
        substance,
        substanceSlug,
        rationale: rationale ? (
          <CitedText text={rationale} article={article} />
        ) : null,
        hasPublicRoute: linkable.has(substanceSlug),
      };
    });
  const groups: InteractionGroup[] = INTERACTION_TIERS.flatMap((tier) => {
    const rows = parseItems(article.interactions[tier.key]);
    return rows.length ? [{ ...tier, ...PRESENTATION[tier.key], rows }] : [];
  });
  if (groups.length === 0)
    return (
      <ArticleGapNotice
        article={article}
        section="interactions"
        footer={<InteractionsSourceFooter elsewhere />}
      />
    );
  return (
    <InteractionsSectionView
      groups={groups}
      onSelectInteraction={onSelectInteraction}
    />
  );
});
