import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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

// Iconify loads remote icon data asynchronously. In jsdom that callback can
// outlive test teardown and attempt to update React after `window` is gone.
// Test the app-owned Icon wrapper without that external loader.
vi.mock('@iconify/react', () => ({
  Icon: () => null,
}));
