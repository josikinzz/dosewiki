import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";

export interface ClassStructureItem {
  key: string;
  label: string;
  smiles: string;
  rLabels: Record<string, string>;
}

interface ManualChemicalClass {
  key: string;
  label: string;
  structure?: {
    smiles?: string;
    rLabels?: Record<string, string>;
  };
}

export const CLASS_STRUCTURES: ClassStructureItem[] = (
  chemicalIndexManual.classes as ManualChemicalClass[]
)
  .filter((cls) => typeof cls.structure?.smiles === "string" && cls.structure.smiles.trim().length > 0)
  .map((cls) => ({
    key: cls.key,
    label: cls.label,
    smiles: cls.structure!.smiles!.trim(),
    rLabels: cls.structure?.rLabels ?? {},
  }));
