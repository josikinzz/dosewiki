import { devFetch, type DevFetchPayload } from "../devFetch";
import type { MoleculeClassTemplate, MoleculeOverride } from "./moleculeEditorTypes";

export interface MoleculeTemplateSummary {
  classKey: string;
  updatedAt: number | null;
}

function nullableDepiction<T>(payload: DevFetchPayload, key: "override" | "template", label: string): T | null {
  const value = payload[key];
  if (value === null) {
    return null;
  }
  if (
    typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as { molblock?: unknown }).molblock === "string"
  ) {
    return value as T;
  }
  throw new Error(`The server did not return the ${label}.`);
}

export async function readMoleculeOverride(slug: string): Promise<MoleculeOverride | null> {
  const payload = await devFetch(`/api/dev/molecule-override?slug=${encodeURIComponent(slug)}`, {
    messages: {
      network: "Network error while loading the molecule depiction.",
      failure: "Unable to load the molecule depiction.",
    },
  });
  return nullableDepiction<MoleculeOverride>(payload, "override", "molecule depiction");
}

export async function readMoleculeTemplate(classKey: string): Promise<MoleculeClassTemplate | null> {
  const payload = await devFetch(`/api/dev/molecule-class-template?classKey=${encodeURIComponent(classKey)}`, {
    messages: {
      network: "Network error while loading the class template.",
      failure: "Unable to load the class template.",
    },
  });
  return nullableDepiction<MoleculeClassTemplate>(payload, "template", "class template");
}

export async function readMoleculeTemplateList(): Promise<MoleculeTemplateSummary[]> {
  const payload = await devFetch("/api/dev/molecule-class-template?list=1", {
    messages: {
      network: "Network error while loading the template list.",
      failure: "The template list could not be read.",
    },
  });
  const { templates } = payload;
  if (!Array.isArray(templates)) {
    throw new Error("The server did not return the template list.");
  }
  return templates.map((row: unknown) => {
    const entry = row as { classKey?: unknown; updatedAt?: unknown } | null;
    if (typeof entry?.classKey !== "string") {
      throw new Error("The server returned a template without a class key.");
    }
    return {
      classKey: entry.classKey,
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : null,
    };
  });
}
