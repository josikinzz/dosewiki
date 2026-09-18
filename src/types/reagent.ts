interface ProtestKitSubstance {
  name: string;
  aliases: string[];
}

export interface ReagentColor {
  id: number;
  name: string;
  simple: boolean;
  simpleColorId: number;
}

export interface ReagentResult {
  reagent: string; // e.g., "marq_desc", "meck_desc"
  colors: ReagentColor[];
  hint: string;
  isReacting: boolean;
}

export interface ProtestKitResponse {
  substance: ProtestKitSubstance;
  reagents: ReagentResult[];
}

interface NormalizedReagentColor {
  id: number;
  name: string;
  hex: string;
}

export interface NormalizedReagentResult {
  key: string;
  reagent: string;
  label: string;
  description: string;
  colors: NormalizedReagentColor[];
  hint: string;
  isReacting: boolean;
  isKnownReagent: boolean;
}

export interface NormalizedReagentData {
  substance: ProtestKitSubstance;
  reagents: NormalizedReagentResult[];
}

export interface ReagentDisplayEntry {
  key: string;
  reagent: string;
  label: string;
  description: string;
  hint: string;
  isReacting: boolean;
  colors: NormalizedReagentColor[];
}
