import { vi } from "vitest";

export interface TestMoleculeSvgMapping {
  filename: string;
  articleId: number;
  articleTitle: string;
  matchedField: string;
  matchedValue: string;
  resolution?: string;
  deduplicatedFrom?: string[];
}

const moleculeSvgMappingState = vi.hoisted(() => {
  const mappings: TestMoleculeSvgMapping[] = [];

  return {
    mappings,
    reset() {
      mappings.splice(0, mappings.length);
    },
    set(nextMappings: TestMoleculeSvgMapping[]) {
      mappings.splice(0, mappings.length, ...nextMappings);
    },
  };
});

const iconModuleState = vi.hoisted(() => ({
  NullIcon: () => null,
}));

vi.mock("@/data/mappings/moleculeSvgMappings.json", () => ({
  default: {
    mappings: moleculeSvgMappingState.mappings,
  },
}));

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();

  return {
    ...actual,
    Atom: iconModuleState.NullIcon,
    BrainCircuit: iconModuleState.NullIcon,
    BrainCog: iconModuleState.NullIcon,
    Cog: iconModuleState.NullIcon,
    FlaskRound: iconModuleState.NullIcon,
    Hexagon: iconModuleState.NullIcon,
    TrendingDown: iconModuleState.NullIcon,
  };
});

export function setMoleculeSvgMappings(mappings: TestMoleculeSvgMapping[]): void {
  moleculeSvgMappingState.set(mappings);
}

export function resetAssetAdapters(): void {
  moleculeSvgMappingState.reset();
}

export function getMoleculeSvgMappingsForTest(): TestMoleculeSvgMapping[] {
  return [...moleculeSvgMappingState.mappings];
}
