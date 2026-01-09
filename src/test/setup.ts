import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock JSON imports
vi.mock('@/data/mappings/moleculeSvgMappings.json', () => ({
  default: { mappings: [] },
}));

// Mock icon imports (return simple component)
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    // Icons used in contentBuilder
    Atom: () => null,
    BrainCircuit: () => null,
    BrainCog: () => null,
    Cog: () => null,
    FlaskRound: () => null,
    Hexagon: () => null,
    TrendingDown: () => null,
  };
});
