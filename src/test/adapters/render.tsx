import { cleanup, render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderWithTestAdapters(
  ui: ReactElement,
  options?: RenderOptions,
): ReturnType<typeof render> {
  return render(ui, options);
}

export function cleanupRenderAdapters(): void {
  cleanup();
}
