import { assert, describe, expect, it, test } from 'vitest';

import OCL from '#lib';
import debugOCL from '#lib_debug';

const allAPI = Object.keys(OCL).toSorted();

test('debug build should have the same exports', () => {
  expect(allAPI).toStrictEqual(Object.keys(debugOCL).toSorted());
});

test('top-level API', () => {
  expect(allAPI).toMatchSnapshot();

  for (const api of allAPI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert((OCL as any)[api], `Missing top-level API: ${api}`);
  }
});

describe('class prototypes', () => {
  // eslint-disable-next-line vitest/prefer-each
  for (const key of allAPI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (OCL as any)[key];
    if (typeof api === 'function') {
      // eslint-disable-next-line vitest/no-conditional-tests
      it(`static properties of ${key}`, () => {
        expect(getFilteredKeys(api)).toMatchSnapshot();
      });

      if (typeof api.prototype === 'object') {
        // eslint-disable-next-line vitest/no-conditional-tests
        it(`prototype properties of ${key}`, () => {
          expect(getFilteredKeys(api.prototype)).toMatchSnapshot();
        });
      }
    }
  }
});

describe('DoseWiki fork API', () => {
  // The prototype snapshots above must keep listing the local additions; this
  // names them explicitly so a regenerated snapshot cannot silently drop them.
  it('exposes the bold-bond marker on Molecule', () => {
    expect(Object.keys(OCL.Molecule.prototype)).toEqual(
      expect.arrayContaining(['isBondBold', 'setBondBold']),
    );
  });

  it('exposes the fine-rotation runtime toggle on CanvasEditor', () => {
    expect(typeof OCL.CanvasEditor.prototype.setFineRotationEnabled).toBe(
      'function',
    );
  });
});

function getFilteredKeys(obj: Record<string, unknown>) {
  return Object.keys(obj)
    .filter((key) => {
      // Filter out GWT-specific properties.
      return key.length > 2;
    })
    .toSorted();
}
