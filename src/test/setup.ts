import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// jsdom has no ResizeObserver, which Radix's popover Arrow requires (it measures the
// trigger through @radix-ui/react-use-size to centre itself). No layout exists in
// jsdom for the measurement to matter, so a settling-but-inert stub is the whole
// contract the tests need.
if (typeof window !== 'undefined' && typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom's `CSS` namespace has no `supports` (only `escape`). The appearance chroma
// writers (the pre-paint bootstrap in src/theme/index.ts and applyChromaToDocument)
// probe `CSS.supports` for relative colour syntax before engaging, so without it every
// chroma test would throw or measure the disengaged branch. Model a current engine:
// everything is supported. A test for the unsupporting branch spies on `supports`.
if (typeof window !== 'undefined') {
  const css = (globalThis as { CSS?: { supports?: unknown } }).CSS ?? {};
  if (typeof css.supports !== 'function') {
    css.supports = () => true;
    Object.defineProperty(globalThis, 'CSS', { configurable: true, writable: true, value: css });
  }
}

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

// jsdom never fetches external stylesheets, so a dynamically attached
// `<link rel="stylesheet">` fires neither `load` nor `error` — ever, and its
// `sheet` stays null forever. Real browsers always settle one of the two and
// populate `sheet` on success, and the appearance system relies on both:
// applyAppearanceToDocument (src/context/ThemeContext.tsx) waits for the
// Pro/light-mode sheet's `load` before flipping the root attribute it gates,
// and treats a non-null `sheet` as already-loaded on later flips. Under bare
// jsdom every toggle-to-pro/light test would therefore hang — the first flip
// awaiting a `load` that never comes, and every repeat flip re-awaiting a link
// whose `sheet` never populates. Settle stylesheet links asynchronously on
// attachment — matching the browser contract of "settles after attach, not
// synchronously" — with a stub sheet and a `load` event.
if (typeof window !== 'undefined') {
  const settleStylesheetLinks = (nodes: NodeList) => {
    for (const node of nodes) {
      if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
        queueMicrotask(() => {
          Object.defineProperty(node, 'sheet', {
            configurable: true,
            value: { cssRules: [] } as unknown as CSSStyleSheet,
          });
          node.dispatchEvent(new Event('load'));
        });
      }
    }
  };
  new MutationObserver((mutations) => {
    for (const mutation of mutations) settleStylesheetLinks(mutation.addedNodes);
  }).observe(document.documentElement, { childList: true, subtree: true });
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

// Icon.tsx registers its offline bundle via addCollection at module scope and
// renders bundled glyphs synchronously; unbundled names still start an async
// remote load whose callback can outlive test teardown in jsdom and attempt to
// update React after `window` is gone. Suites therefore get a null renderer by
// default; `Icon.test.tsx` unmocks this to exercise the real offline wrapper.
vi.mock('@iconify/react', () => ({
  Icon: () => null,
  addCollection: () => {},
}));
