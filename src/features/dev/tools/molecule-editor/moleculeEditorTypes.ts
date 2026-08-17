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

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface SaveResult {
  tone: "success" | "danger";
  title?: string;
  message: string;
}
