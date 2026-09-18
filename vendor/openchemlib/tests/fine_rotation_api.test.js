import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initCanvasEditor } from '../lib/canvas_editor/init/canvas_editor.js';

const fixture = vi.hoisted(() => ({
  createEditor: vi.fn(),
  editorArea: {
    setFineRotationEnabled: vi.fn(),
    getMode: vi.fn(() => 0),
  },
}));

vi.mock('../lib/canvas_editor/create_editor.js', () => ({
  createEditor: fixture.createEditor,
}));

const JavaEditorArea = {
  EDITOR_EVENT_MOLECULE_CHANGED: 1,
  EDITOR_EVENT_SELECTION_CHANGED: 2,
  EDITOR_EVENT_HIGHLIGHT_ATOM_CHANGED: 3,
  EDITOR_EVENT_HIGHLIGHT_BOND_CHANGED: 4,
  MODE_REACTION: 8,
};

const CanvasEditor = initCanvasEditor(
  JavaEditorArea,
  class JavaEditorToolbar {},
  class JavaUIHelper {},
  class Molecule {},
  class Reaction {},
);

describe('CanvasEditor fine rotation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.createEditor.mockReturnValue({
      editorArea: fixture.editorArea,
      toolbar: null,
      uiHelper: {},
      destroy: vi.fn(),
    });
  });

  it('accepts the constructor option and changes the live editor mode', () => {
    const parent = {};
    const editor = new CanvasEditor(parent, { fineRotation: true });

    expect(fixture.createEditor).toHaveBeenCalledWith(
      parent,
      { fineRotation: true },
      expect.any(Function),
      JavaEditorArea,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    editor.setFineRotationEnabled(false);

    expect(fixture.editorArea.setFineRotationEnabled).toHaveBeenCalledWith(
      false,
    );
  });
});
