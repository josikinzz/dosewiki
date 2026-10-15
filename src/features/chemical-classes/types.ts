import type { DosageCategoryGroup } from "@/data/builders/library";
import type { IconName } from "@/components/common/Icon";

export interface ChemicalClassMolecule {
  slug: string;
  name: string;
  url: string;
}

export interface ChemicalClassIndexEntry {
  key: string;
  label: string;
  icon: IconName;
  total: number;
  description?: string;
  molecules: ChemicalClassMolecule[];
  panels: DosageCategoryGroup[];
}

export interface ChemicalClassTreeNode {
  key: string;
  label: string;
  directTotal: number;
  rolledTotal: number;
  children: string[];
  parents: string[];
}

export interface ChemicalClassTreePayload {
  roots: string[];
  nodes: Record<string, ChemicalClassTreeNode>;
}

export interface ChemicalClassTreeSummary {
  key: string;
  label: string;
  rolledTotal: number;
}

export interface ChemicalClassDetail extends ChemicalClassIndexEntry {
  lineage: ChemicalClassTreeSummary[];
  bioisosteres: ChemicalClassTreeSummary[];
  children: ChemicalClassTreeSummary[];
  otherParents: Array<{ key: string; label: string }>;
  structureUrl: string | null;
}
