export interface ProtestKitSubstance {
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
