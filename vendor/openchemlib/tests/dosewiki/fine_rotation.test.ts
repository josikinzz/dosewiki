// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CanvasEditor, Molecule } from '#lib';

// DoseWiki fork delta: GenericEditorArea.setFineRotationEnabled removes the
// 20-pixel horizontal dead zone of the zoom/rotate tool while keeping the
// 1/50 rad per pixel sensitivity and the vertical zoom dead zone
// (LOCAL_MODIFICATIONS.md, "Fine rotation"). Upstream ignores drags shorter
// than 20 pixels, has no `fineRotation` option, and no runtime toggle.
//
// The editor is driven end to end through the committed bundle: real
// CanvasEditor, real Java editor area and toolbar, real pointer plumbing. Only
// the canvas drawing surface and a few DOM APIs jsdom lacks are stubbed.

const RADIANS_PER_PIXEL = 1 / 50;
const LEGACY_DEAD_ZONE = 20;
const CANVAS = { width: 400, height: 300 };

type Vector = { x: number; y: number };

function stubDrawingSurface() {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, property) {
      if (property === 'measureText') {
        return () => ({
          actualBoundingBoxLeft: 0,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxRight: 8,
        });
      }
      return property in target ? target[property] : () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: CANVAS.width,
    bottom: CANVAS.height,
    ...CANVAS,
    toJSON: () => CANVAS,
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'CSSStyleSheet',
    class {
      replaceSync() {}
    },
  );
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        height?: number,
      ) {
        if (typeof dataOrWidth === 'number') {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = height ?? 0;
        }
      }
    },
  );
}

class EditorHarness {
  readonly editor: CanvasEditor;
  readonly molecule: Molecule;
  readonly #host: HTMLDivElement;
  readonly #canvas: HTMLCanvasElement;

  constructor(options?: { fineRotation?: boolean }) {
    this.#host = document.createElement('div');
    document.body.append(this.#host);
    this.editor = new CanvasEditor(this.#host, options);
    this.editor.setMolecule(Molecule.fromSmiles('CCO'));
    // The editor draws into the canvas nested in its container div; the
    // toolbar canvas sits directly under the shadow root.
    const canvas = this.#host
      .querySelector('[data-openchemlib-canvas-editor]')
      ?.shadowRoot?.querySelector('div > canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('editor canvas not found');
    }
    this.#canvas = canvas;
    this.molecule = this.editor.getMolecule();
  }

  /** Direction of the first bond, in canvas coordinates. */
  bondVector(): Vector {
    return {
      x: this.molecule.getAtomX(1) - this.molecule.getAtomX(0),
      y: this.molecule.getAtomY(1) - this.molecule.getAtomY(0),
    };
  }

  selectZoomTool() {
    for (const type of ['keydown', 'keyup']) {
      this.#canvas.dispatchEvent(
        new KeyboardEvent(type, { key: 'z', bubbles: true }),
      );
    }
  }

  /** Presses on empty canvas, drags by (dx, dy) in one move, releases. */
  drag(dx: number, dy: number) {
    const origin = { x: 20, y: 20 };
    this.#pointer('pointerdown', origin);
    this.#pointer('pointermove', { x: origin.x + dx, y: origin.y + dy });
    this.#pointer('pointerup', { x: origin.x + dx, y: origin.y + dy });
  }

  #pointer(type: string, at: Vector) {
    const event = new MouseEvent(type, {
      bubbles: true,
      composed: true,
      button: 0,
      clientX: at.x,
      clientY: at.y,
    });
    // jsdom's MouseEvent does not derive offset coordinates or pointer ids.
    Object.defineProperties(event, {
      offsetX: { value: at.x },
      offsetY: { value: at.y },
      pointerId: { value: 1 },
    });
    this.#canvas.dispatchEvent(event);
  }

  async destroy() {
    // Let the queued repaint run against the stubbed surface before teardown.
    // (Executor form: the package's tsconfig lib predates Promise.withResolvers.)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.editor.destroy();
    this.#host.remove();
  }
}

function angleBetween(before: Vector, after: Vector) {
  return (
    Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x)
  );
}

function lengthOf(vector: Vector) {
  return Math.hypot(vector.x, vector.y);
}

const harnesses: EditorHarness[] = [];

function open(options?: { fineRotation?: boolean }) {
  const harness = new EditorHarness(options);
  harnesses.push(harness);
  return harness;
}

beforeAll(() => {
  stubDrawingSurface();
});

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.destroy()));
});

describe('fine rotation', () => {
  it('turns a drag below the legacy dead zone into a proportional angle', () => {
    const harness = open({ fineRotation: true });
    harness.selectZoomTool();
    const before = harness.bondVector();
    const pixels = LEGACY_DEAD_ZONE / 2;

    harness.drag(pixels, 0);

    const after = harness.bondVector();
    expect(angleBetween(before, after)).toBeCloseTo(pixels * RADIANS_PER_PIXEL, 6);
    expect(lengthOf(after)).toBeCloseTo(lengthOf(before), 6);
  });

  it('keeps the legacy sensitivity above the dead zone', () => {
    const pixels = LEGACY_DEAD_ZONE + 10;
    for (const fineRotation of [true, false]) {
      const harness = open({ fineRotation });
      harness.selectZoomTool();
      const before = harness.bondVector();

      harness.drag(pixels, 0);

      expect(angleBetween(before, harness.bondVector())).toBeCloseTo(
        pixels * RADIANS_PER_PIXEL,
        6,
      );
    }
  });

  it('keeps the vertical zoom dead zone', () => {
    const harness = open({ fineRotation: true });
    harness.selectZoomTool();
    const before = harness.bondVector();

    harness.drag(0, LEGACY_DEAD_ZONE / 2);

    const after = harness.bondVector();
    expect(lengthOf(after)).toBeCloseTo(lengthOf(before), 6);
    expect(angleBetween(before, after)).toBeCloseTo(0, 6);
  });

  it('can be switched on at runtime without recreating the editor', () => {
    const harness = open();
    harness.selectZoomTool();
    const initial = harness.bondVector();
    const pixels = LEGACY_DEAD_ZONE / 2;

    harness.drag(pixels, 0);
    expect(angleBetween(initial, harness.bondVector())).toBeCloseTo(0, 6);

    harness.editor.setFineRotationEnabled(true);
    harness.drag(pixels, 0);
    expect(angleBetween(initial, harness.bondVector())).toBeCloseTo(
      pixels * RADIANS_PER_PIXEL,
      6,
    );

    harness.editor.setFineRotationEnabled(false);
    harness.drag(pixels, 0);
    expect(angleBetween(initial, harness.bondVector())).toBeCloseTo(
      pixels * RADIANS_PER_PIXEL,
      6,
    );
  });
});

describe('legacy coarse rotation', () => {
  it('remains the package default and ignores drags inside the dead zone', () => {
    const harness = open();
    harness.selectZoomTool();
    const before = harness.bondVector();

    harness.drag(LEGACY_DEAD_ZONE - 1, 0);

    expect(angleBetween(before, harness.bondVector())).toBeCloseTo(0, 6);
  });
});
