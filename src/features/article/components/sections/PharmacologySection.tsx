import { memo } from "react";
import {
  extractCitationTokens,
  stripCitationTokens,
} from "@/lib/citations/citationTokens";
import { normalizePharmacologySection } from "../../../../../lib/article/normalization.mjs";
import { projectMetaboliteDisplay } from "@/lib/article/scientificFieldPolicy.mjs";
import type { SubstanceArticle } from "@/schema";
import { ArticleText, CitationMarker } from "../CitedText";
import { EditableSlot, EditableValue } from "../../editing";
import {
  ArticleGapNotice,
  ArticleSubsectionGapNotice,
} from "./ArticleGapNotice";
import type { SubsectionGapPolicyKey } from "./articleGapCopy";
import {
  getMechanismPath,
  parseMechanismEntry,
  splitMechanismActivity,
} from "./pharmacologyMechanisms";
import {
  PharmacologySectionView,
  type PharmacologyBindingRow,
  type PharmacologyMetaboliteRow,
} from "./PharmacologySectionView.client";

function uniqueCitationIds(text: string | null | undefined): string[] {
  if (!text?.includes("[cite:")) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const token of extractCitationTokens(text))
    if (!seen.has(token.id)) {
      seen.add(token.id);
      ids.push(token.id);
    }
  return ids;
}

interface PharmacologySectionProps {
  article: SubstanceArticle;
  onSelectMechanism?: (slug: string, qualifier?: string) => void;
}

export const PharmacologySection = memo(function PharmacologySection({
  article,
  onSelectMechanism,
}: PharmacologySectionProps) {
  const pharmacology = normalizePharmacologySection(article.pharmacology);
  const storedPharmacodynamics = article.pharmacology?.pharmacodynamics ?? "";
  const storedPharmacokinetics = article.pharmacology?.pharmacokinetics ?? "";
  const hasStoredPharmacodynamics = storedPharmacodynamics.trim().length > 0;
  const hasStoredPharmacokinetics = storedPharmacokinetics.trim().length > 0;
  const pharmacodynamicsText =
    pharmacology.pharmacodynamics?.trim().length > 0
      ? pharmacology.pharmacodynamics
      : (pharmacology.summary ?? "");
  const hasSummary = pharmacodynamicsText.trim().length > 0;
  const hasBindingSites = pharmacology.binding_sites.length > 0;
  const hasPharmacokinetics = pharmacology.pharmacokinetics?.trim().length > 0;
  const hasMetabolites = pharmacology.metabolites?.length > 0;
  const halfLife = pharmacology.half_life?.trim() ?? "";
  const hasHalfLife = halfLife.length > 0;
  const hasPharmacodynamics = hasSummary || hasBindingSites;
  if (!(
    hasPharmacodynamics ||
    hasPharmacokinetics ||
    hasMetabolites ||
    hasHalfLife
  ))
    return <ArticleGapNotice article={article} section="pharmacology" />;

  const emptySlots: SubsectionGapPolicyKey[] = [
    ...(hasPharmacokinetics ? [] : (["pharmacokinetics"] as const)),
    ...(hasMetabolites ? [] : (["metabolites"] as const)),
  ];
  const bindingReferenceIds = uniqueCitationIds(
    pharmacology.binding_sites
      .flatMap((entry) => [
        entry.tag || entry.target,
        entry.affinity,
        entry.efficacy,
      ])
      .filter(Boolean)
      .join(" "),
  );
  const metaboliteReferenceIds = uniqueCitationIds(
    (pharmacology.metabolites ?? []).join(" "),
  );
  const bindingRows: PharmacologyBindingRow[] = pharmacology.binding_sites.map(
    (entry) => {
      const tag = entry.tag;
      const mechanismText = stripCitationTokens(tag || entry.target);
      const { base, qualifier } = mechanismText
        ? parseMechanismEntry(mechanismText)
        : { base: "", qualifier: undefined };
      const mechanismLink =
        tag && base ? getMechanismPath(base, qualifier) : undefined;
      const { site, activity } = splitMechanismActivity(base);
      return {
        site,
        activity: activity ?? "",
        qualifier,
        mechanismLink,
        affinity: stripCitationTokens(entry.affinity ?? ""),
        efficacy: stripCitationTokens(entry.efficacy ?? ""),
      };
    },
  );
  const metaboliteRows: PharmacologyMetaboliteRow[] = (
    pharmacology.metabolites ?? []
  ).map((value) => {
    const parsed = projectMetaboliteDisplay(stripCitationTokens(value));
    return {
      name: parsed.name,
      abbreviation: parsed.abbreviation,
      qualifications: parsed.qualifications,
      status:
        parsed.status === "active" || parsed.status === "inactive"
          ? parsed.status
          : undefined,
    };
  });
  const paragraphs = hasSummary
    ? pharmacodynamicsText
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const pharmacodynamicsBody = hasSummary ? (
    <div className="space-y-3">
      {paragraphs.map((paragraph, index) => (
        <ArticleText key={index} text={paragraph} article={article} />
      ))}
    </div>
  ) : null;
  const pharmacodynamicsContent = hasStoredPharmacodynamics ? (
    <EditableValue
      as="div"
      label="Pharmacodynamics"
      path="pharmacology.pharmacodynamics"
      value={storedPharmacodynamics}
    >
      {pharmacodynamicsBody}
    </EditableValue>
  ) : (
    pharmacodynamicsBody
  );
  const missingPharmacodynamicsSlot = !hasStoredPharmacodynamics ? (
    <EditableSlot
      emptyLabel="Add pharmacodynamics"
      label="Pharmacodynamics"
      path="pharmacology.pharmacodynamics"
      value={storedPharmacodynamics}
    />
  ) : null;
  const pharmacokineticsBody = hasPharmacokinetics ? (
    <ArticleText text={pharmacology.pharmacokinetics} article={article} />
  ) : null;
  const pharmacokineticsContent = hasStoredPharmacokinetics ? (
    <EditableValue
      as="div"
      label="Pharmacokinetics"
      path="pharmacology.pharmacokinetics"
      value={storedPharmacokinetics}
    >
      {pharmacokineticsBody}
    </EditableValue>
  ) : (
    pharmacokineticsBody
  );
  const missingPharmacokineticsSlot = !hasStoredPharmacokinetics ? (
    <EditableSlot
      emptyLabel="Add pharmacokinetics"
      label="Pharmacokinetics"
      path="pharmacology.pharmacokinetics"
      value={storedPharmacokinetics}
    />
  ) : null;
  const halfLifeContent = hasHalfLife ? (
    <EditableValue
      as="div"
      label="Half-life"
      path="pharmacology.half_life"
      value={article.pharmacology?.half_life ?? ""}
    >
      <ArticleText text={halfLife} article={article} />
    </EditableValue>
  ) : null;

  return (
    <PharmacologySectionView
      hasSummary={hasSummary}
      hasPharmacodynamics={hasPharmacodynamics}
      hasPharmacokinetics={hasPharmacokinetics}
      pharmacodynamicsContent={pharmacodynamicsContent}
      missingPharmacodynamicsSlot={missingPharmacodynamicsSlot}
      pharmacokineticsContent={pharmacokineticsContent}
      missingPharmacokineticsSlot={missingPharmacokineticsSlot}
      halfLifeContent={halfLifeContent}
      bindingRows={bindingRows}
      bindingTitleAdornment={
        <CitationMarker article={article} referenceIds={bindingReferenceIds} />
      }
      metaboliteRows={metaboliteRows}
      metaboliteTitleAdornment={
        <CitationMarker
          article={article}
          referenceIds={metaboliteReferenceIds}
        />
      }
      subsectionGapNotice={
        <ArticleSubsectionGapNotice
          article={article}
          slots={emptySlots}
          parentGapKey="pharmacology"
        />
      }

      onSelectMechanism={onSelectMechanism}
    />
  );
});
