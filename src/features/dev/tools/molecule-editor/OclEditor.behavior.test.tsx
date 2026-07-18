import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openChemLibMock = vi.hoisted(() => ({
  instances: [] as Array<{
    options: { initialMode?: string; fineRotation?: boolean };
    setFineRotationEnabled: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("openchemlib", () => {
  class CanvasEditor {
    options: { initialMode?: string; fineRotation?: boolean };
    setFineRotationEnabled = vi.fn();
    setOnChangeListener = vi.fn();
    removeOnChangeListener = vi.fn();
    clearAll = vi.fn();
    destroy = vi.fn();

    constructor(
      _host: HTMLElement,
      options: { initialMode?: string; fineRotation?: boolean } = {},
    ) {
      this.options = options;
      openChemLibMock.instances.push(this);
    }
  }

  return {
    CanvasEditor,
    Molecule: {
      fromMolfile: vi.fn(),
    },
  };
});

import { OclEditor } from "./OclEditor";

describe("OclEditor fine rotation preference", () => {
  afterEach(() => {
    cleanup();
    openChemLibMock.instances.length = 0;
  });

  it("applies fine rotation at construction and updates the same editor without emitting a change", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OclEditor source={null} fineRotation onChange={onChange} />,
    );

    await waitFor(() => expect(openChemLibMock.instances).toHaveLength(1));
    const editor = openChemLibMock.instances[0]!;
    expect(editor.options).toMatchObject({
      initialMode: "molecule",
      fineRotation: true,
    });
    await waitFor(() =>
      expect(editor.setFineRotationEnabled).toHaveBeenLastCalledWith(true),
    );

    rerender(<OclEditor source={null} fineRotation={false} onChange={onChange} />);

    await waitFor(() =>
      expect(editor.setFineRotationEnabled).toHaveBeenLastCalledWith(false),
    );
    expect(openChemLibMock.instances).toHaveLength(1);
    expect(editor.destroy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
