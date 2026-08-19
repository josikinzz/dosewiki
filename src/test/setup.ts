import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// `findBy*` and `waitFor` default to a one-second ceiling. That is generous for a
// state update and far too tight for the first render of a `next/dynamic` chunk
// while four hundred test files share the machine — the Theme Lab's editor is
// imported lazily, so whichever test in a file opens the panel first pays for the
// import, and it was crossing one second only under full-suite load.
//
// Raising the ceiling costs a passing test nothing: these helpers resolve as soon
// as their condition holds. It only changes how long a genuine failure takes to
// report, which is the right trade against a flake that depends on how the
// scheduler happened to distribute files.
configure({ asyncUtilTimeout: 5_000 });

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
