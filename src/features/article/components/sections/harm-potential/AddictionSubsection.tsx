import { getArticleValueByPath } from "@/data/schema/fieldPath";
import type { SubstanceArticle } from "@/schema";
import { ArticleText } from "../../CitedText";
import { msg } from "@/i18n/messages";
import { AddictionSubsectionView } from "./AddictionSubsectionView.client";
import type { NormalizedHarmPotential } from "./HarmPotentialUtils";

import { EditableHarmText } from "./EditableHarmText";
interface AddictionSubsectionProps {
  addiction: NormalizedHarmPotential["addiction"];
  article: SubstanceArticle;
}

export function AddictionSubsection({
  addiction,
  article,
}: AddictionSubsectionProps) {
  const project = (
    kind: "psychological" | "physical_dependence",
    path: string,
  ) => {
    const item = addiction[kind];
    if (!item.description) return undefined;
    const editable = getArticleValueByPath(article, path) === item.description;
    const label =
      kind === "psychological"
        ? msg("Psychological dependence description")
        : msg("Physical dependence description");
    return {
      level: item.level,
      content: (
        <EditableHarmText
          editable={editable}
          label={label}
          path={path}
          value={item.description}
        >
          <ArticleText
            text={item.description}
            article={article}
            tone="muted"
            className="theme-text-muted mb-3 text-xs italic leading-relaxed"
          />
        </EditableHarmText>
      ),
    };
  };
  return (
    <AddictionSubsectionView
      psychological={project(
        "psychological",
        "harm_potential.addiction.psychological.description",
      )}
      physical={project(
        "physical_dependence",
        "harm_potential.addiction.physical_dependence.description",
      )}
    />
  );
}
