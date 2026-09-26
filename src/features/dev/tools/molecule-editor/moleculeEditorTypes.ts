export type EditorMode = "substances" | "classes" | "templates";

export interface MoleculeClassTemplate {
  classKey: string;
  molblock: string;
  boldBonds?: number[];
  updatedAt: number;
  updatedBy?: string;
}

export interface MoleculeOverride {
  slug: string;
  molblock: string;
  svg: string;
  smiles?: string;
  boldBonds?: number[];
  source?: "seeded" | "editor" | "template";
  updatedAt: string;
  updatedBy?: string;
}

export interface SaveResult {
  tone: "success" | "danger";
  /** A refusal with its own way forward: a revision conflict, or the write freeze. */
  kind?: "conflict" | "frozen";
  title?: string;
  message: string;
}
