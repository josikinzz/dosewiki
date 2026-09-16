import "server-only";

import {
  getPublicChemicalClassDetailPayload,
  getPublicChemicalClassTreePayload,
} from "@server/data/publicChemicalClassIndex";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { msg, type MessageValues } from "@/i18n/messages";
import type { ChemicalClassDetail } from "@/features/chemical-classes/types";

const CHEMICAL_CLASS_COPY_KEYS = [flavoredCopyKey("seo-chemical-classes-description")];

/** Preserve the class route's metadata-length contract after locale lookup. */
export function formatChemicalClassMetadataDescription(value: string): string {
  const clean = value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[_`[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 160 ? `${clean.slice(0, 157).trimEnd()}...` : clean;
}

export async function loadChemicalClassTreeRoute() {
  const [payload, copy] = await Promise.all([getPublicChemicalClassTreePayload(), getCopyByKeys(CHEMICAL_CLASS_COPY_KEYS)]);
  const classCount = Object.keys(payload.nodes).length;
  const descriptionTemplate = flavoredCopyText(
    copy,
    "seo-chemical-classes-description",
    msg("Browse the chemical class tree - {{classCount}} classes organized by structural lineage on {{siteName}}."),
  );

  return {
    payload,
    metadata: {
      title: msg("Chemical Classes"),
      description: descriptionTemplate,
      values: { classCount, siteName: SITE_FLAVOR_CONFIG.name },
    },
    canonicalRoute: { family: "chemicalClasses" as const },
  };
}

type ChemicalClassRouteMetadata = {
  title: string;
  description: string;
  values?: MessageValues;
};

export type ChemicalClassDetailRouteResult =
  | {
      kind: "ok";
      detail: ChemicalClassDetail;
      metadata: ChemicalClassRouteMetadata;
      canonicalRoute: { family: "chemicalClass"; params: { classKey: string } };
    }
  | {
      kind: "not-found";
      metadata: ChemicalClassRouteMetadata;
      canonicalRoute: { family: "chemicalClass"; params: { classKey: string } };
    };

export async function loadChemicalClassDetailRoute(
  classKey: string,
): Promise<ChemicalClassDetailRouteResult> {
  const detail = await getPublicChemicalClassDetailPayload(classKey);
  const canonicalRoute = { family: "chemicalClass" as const, params: { classKey } };

  if (!detail) {
    return {
      kind: "not-found",
      metadata: {
        title: msg("Chemical class"),
        description: msg(
          "Explore {{className}} lineage, subclasses, molecules, and published substances on {{siteName}}.",
        ),
        values: { className: classKey, siteName: SITE_FLAVOR_CONFIG.name },
      },
      canonicalRoute,
    };
  }

  return {
    kind: "ok",
    detail,
    metadata: {
      title: detail.label,
      description:
        detail.description ??
        msg(
          "Explore {{className}} lineage, subclasses, molecules, and published substances on {{siteName}}.",
        ),
      values: detail.description
        ? undefined
        : { className: detail.label, siteName: SITE_FLAVOR_CONFIG.name },
    },
    canonicalRoute: {
      family: "chemicalClass",
      params: { classKey: detail.key },
    },
  };
}
