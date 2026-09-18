import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TracingControls, TracingOverlay, useTracingLayer } from "./TracingLayer";

/** Minimal host wiring the hook to both components, like the editor tab does. */
function Harness() {
  const layer = useTracingLayer();
  return (
    <div>
      <TracingOverlay layer={layer} className="overlay" />
      <TracingControls layer={layer} />
    </div>
  );
}

const createObjectURLMock = vi.fn(() => "blob:tracing-test");
const revokeObjectURLMock = vi.fn();

describe("TracingLayer", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
  });

  it("starts empty: a picker button, no overlay", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Trace an image…" })).toBeInTheDocument();
    expect(screen.queryByTestId("tracing-overlay")).not.toBeInTheDocument();
  });

  it("shows the dropped image over the canvas, faded and click-through-toggleable", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const file = new File(["png-bytes"], "reference.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose a tracing image"), file);

    const overlay = screen.getByTestId("tracing-overlay");
    const image = screen.getByRole("img", { name: "Tracing reference" });
    expect(image).toHaveAttribute("src", "blob:tracing-test");
    expect(image.style.opacity).toBe("0.4");
    // Loading turns adjust mode on for placement — the overlay takes the pointer.
    expect(overlay.className).not.toContain("pointer-events-none");

    // Turning adjust off makes the overlay click-through for drawing.
    await user.click(screen.getByRole("checkbox", { name: "Adjust image" }));
    expect(screen.getByTestId("tracing-overlay").className).toContain("pointer-events-none");

    // Fade and size sliders drive the image style directly.
    expect(screen.getByRole("slider", { name: "Tracing image transparency" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Tracing image size" })).toBeInTheDocument();
  });

  it("ignores non-image files", async () => {
    render(<Harness />);
    // applyAccept off so the file actually reaches loadFile's own MIME check.
    const user = userEvent.setup({ applyAccept: false });
    const file = new File(["text"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Choose a tracing image"), file);
    expect(screen.queryByTestId("tracing-overlay")).not.toBeInTheDocument();
  });

  it("removes the image and revokes its object URL", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const file = new File(["png-bytes"], "reference.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose a tracing image"), file);

    await user.click(screen.getByRole("button", { name: "Remove image" }));

    expect(screen.queryByTestId("tracing-overlay")).not.toBeInTheDocument();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:tracing-test");
    expect(screen.getByRole("button", { name: "Trace an image…" })).toBeInTheDocument();
  });
});
