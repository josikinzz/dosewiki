import { getArticleValueByPath } from "@/data/schema/fieldPath";
import { msg } from "@/i18n/messages";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../../CitedText";
import type { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { buildFieldPath } from "../../../editing";
import { EditableHarmText } from "./EditableHarmText";
import {
  ToxicitySubsectionView,
  type ToxicityContentSlots,
  type ToxicityViewModel,
} from "./ToxicitySubsectionView.client";

interface ToxicitySubsectionProps {
  toxicity: NormalizedHarmPotential["toxicity"];
  article: SubstanceArticle;
}

export function ToxicitySubsection({
  toxicity,
  article,
}: ToxicitySubsectionProps) {
  const notes = toxicity.lethal_dosage.notes;
  const notesPath = "harm_potential.toxicity.lethal_dosage.notes";
  const slots: ToxicityContentSlots = {
    lethalNotes: notes ? (
      <EditableHarmText
        editable={getArticleValueByPath(article, notesPath) === notes}
        label={msg("Lethal dosage notes")}
        path={notesPath}
        value={notes}
      >
        <CitedText text={notes} article={article} />
      </EditableHarmText>
    ) : undefined,
    legacyLd50: toxicity.ld50String ? (
      <CitedText text={toxicity.ld50String} article={article} />
    ) : undefined,
    organs: toxicity.organ_toxicity.map((entry, index) => {
      const base = [
        "harm_potential",
        "toxicity",
        "organ_toxicity",
        index,
      ] as const;
      const render = (
        leaf: "findings" | "mechanism" | "notes",
        label: string,
      ) => {
        const value = entry[leaf];
        if (!value) return undefined;
        const path = buildFieldPath(...base, leaf);
        return (
          <EditableHarmText
            editable={getArticleValueByPath(article, path) === value}
            label={label}
            labelValues={{ system: entry.system ?? msg("Organ") }}
            path={path}
            value={value}
          >
            <CitedText text={value} article={article} />
          </EditableHarmText>
        );
      };
      return {
        findings: render("findings", msg("{{system}} toxicity findings")),
        mechanism: render("mechanism", msg("{{system}} toxicity mechanism")),
        notes: render("notes", msg("{{system}} toxicity notes")),
      };
    }),
    legacyOrgan: toxicity.organToxicityString ? (
      <CitedText text={toxicity.organToxicityString} article={article} />
    ) : undefined,
    carcinogenicity: toxicity.carcinogenicity.description ? (
      <CitedText
        text={toxicity.carcinogenicity.description}
        article={article}
      />
    ) : undefined,
    antibiotic: toxicity.antibiotic_function.description ? (
      <CitedText
        text={toxicity.antibiotic_function.description}
        article={article}
      />
    ) : undefined,
  };
  const model: ToxicityViewModel = {
    lethal: {
      ld50: toxicity.lethal_dosage.ld50,
      hasNotes: Boolean(notes.trim()),
      hasLegacy: Boolean(toxicity.ld50String.trim()) && !notes.trim(),
    },
    organs: toxicity.organ_toxicity.map((entry) => ({
      system: entry.system,
      hasFindings: Boolean(entry.findings),
      hasMechanism: Boolean(entry.mechanism),
      hasNotes: Boolean(entry.notes),
    })),
    hasLegacyOrgan: Boolean(toxicity.organToxicityString.trim()),
    carcinogenicity: {
      level: toxicity.carcinogenicity.level,
      evidence:
        toxicity.carcinogenicity.evidence &&
        typeof toxicity.carcinogenicity.evidence === "object"
          ? (toxicity.carcinogenicity
              .evidence as ToxicityViewModel["carcinogenicity"]["evidence"])
          : null,
      hasDescription: Boolean(toxicity.carcinogenicity.description?.trim()),
    },
    antibiotic: {
      level: toxicity.antibiotic_function.level,
      hasDescription: Boolean(toxicity.antibiotic_function.description?.trim()),
    },
  };
  return <ToxicitySubsectionView model={model} slots={slots} />;
}
