import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Node 25 exposes an experimental global `localStorage` accessor that returns
// `undefined` unless `--localstorage-file` is set. Vitest can copy that accessor
// over jsdom's implementation, so every worker gets deterministic browser-like
// storage. Individual tests may still replace this configurable property.
if (typeof window !== 'undefined') {
  const localStorageValues = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageValues.set(key, String(value)),
      removeItem: (key: string) => localStorageValues.delete(key),
      clear: () => localStorageValues.clear(),
      key: (index: number) => Array.from(localStorageValues.keys())[index] ?? null,
      get length() {
        return localStorageValues.size;
      },
    },
  });
}

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
