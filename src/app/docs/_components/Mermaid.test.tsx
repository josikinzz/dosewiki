import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Mermaid } from "./Mermaid";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn<(id: string, source: string) => Promise<{ svg: string }>>(),
}));

vi.mock("mermaid", () => ({ default: mermaid }));

let intersections: Array<(isIntersecting: boolean) => void>;

beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
  intersections = [];
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  mermaid.render.mockResolvedValue({ svg: '<svg><text>Rendered diagram</text></svg>' });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        intersections.push((isIntersecting) => {
          this.callback(
            [{ target, isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        });
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.theme;
});

function deferRenders() {
  const pending: Array<{
    resolve: (value: { svg: string }) => void;
    reject: (error: Error) => void;
  }> = [];
  mermaid.render.mockImplementation(() => {
    return new Promise<{ svg: string }>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  });
  return pending;
}

describe("Mermaid viewport rendering", () => {
  it("does no diagram work offscreen and uses the latest source and theme on approach", async () => {
    const observeTheme = vi.spyOn(MutationObserver.prototype, "observe");
    const { rerender, container } = render(<Mermaid chart="graph TD; A-->B" title="Pipeline" />);
    await act(async () => {
      intersections[0](false);
      document.documentElement.dataset.theme = "light";
    });
    rerender(<Mermaid chart="graph TD; New-->Source" title="Pipeline" />);

    expect(mermaid.render).not.toHaveBeenCalled();
    expect(mermaid.initialize).not.toHaveBeenCalled();
    expect(observeTheme).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Pipeline" })).toHaveAttribute("data-ready", "false");
    expect(container.querySelector("figcaption")).toHaveTextContent("Pipeline");

    await act(async () => intersections[0](true));
    await waitFor(() => expect(screen.getByText("Rendered diagram")).toBeInTheDocument());
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), "graph TD; New-->Source");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ themeVariables: expect.objectContaining({ primaryColor: "#e1eefa" }) }),
    );
  });

  it("retains an activated diagram offscreen and still responds to theme changes", async () => {
    render(<Mermaid chart="graph TD; A-->B" />);
    await act(async () => intersections[0](true));
    await waitFor(() => expect(screen.getByText("Rendered diagram")).toBeInTheDocument());
    const svg = screen.getByText("Rendered diagram").closest("svg");
    await act(async () => intersections[0](false));
    expect(screen.getByText("Rendered diagram").closest("svg")).toBe(svg);

    await act(async () => { document.documentElement.dataset.theme = "light"; });
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("img")).toHaveAttribute("data-ready", "true");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ themeVariables: expect.objectContaining({ primaryColor: "#e1eefa" }) }),
    );
  });

  it("never commits a pending SVG after a newer theme request, even when the theme returns to dark", async () => {
    const pending = deferRenders();
    render(<Mermaid chart="graph TD; A-->B" />);
    await act(async () => intersections[0](true));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => { document.documentElement.dataset.theme = "light"; });
    await act(async () => { document.documentElement.dataset.theme = "dark"; });

    await act(async () => pending[0].resolve({ svg: '<svg><text>Stale dark</text></svg>' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.queryByText("Stale dark")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("data-ready", "false");

    await act(async () => pending[1].resolve({ svg: '<svg><text>Current dark</text></svg>' }));
    expect(screen.getByText("Current dark")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("data-ready", "true");
  });

  it("does not commit an in-flight SVG after a source update", async () => {
    const pending = deferRenders();
    const { rerender } = render(<Mermaid chart="graph TD; Old-->Source" />);
    await act(async () => intersections[0](true));
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender(<Mermaid chart="graph TD; New-->Source" />);
    await act(async () => pending[0].resolve({ svg: '<svg><text>Old diagram</text></svg>' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.queryByText("Old diagram")).not.toBeInTheDocument();

    await act(async () => pending[1].resolve({ svg: '<svg><text>New diagram</text></svg>' }));
    expect(screen.getByText("New diagram")).toBeInTheDocument();
  });

  it("ignores failures from replaced sources and keeps the source fallback for a current failure", async () => {
    const pending = deferRenders();
    const { rerender } = render(<Mermaid chart="graph TD; Old-->Source" />);
    await act(async () => intersections[0](true));
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender(<Mermaid chart="graph TD; New-->Source" />);
    await act(async () => pending[0].reject(new Error("Old failure")));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.queryByText(/Old failure/)).not.toBeInTheDocument();

    await act(async () => pending[1].reject(new Error("Current failure")));
    expect(screen.getByText(/Current failure/)).toHaveTextContent("graph TD; New-->Source");

    rerender(<Mermaid chart="graph TD; Valid-->Source" />);
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => pending[2].resolve({ svg: '<svg><text>Recovered diagram</text></svg>' }));
    expect(screen.queryByText(/Current failure/)).not.toBeInTheDocument();
    expect(screen.getByText("Recovered diagram")).toBeInTheDocument();
  });

  it("renders without IntersectionObserver while serializing diagrams and cancelling removed work", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const pending = deferRenders();
    const { rerender } = render(
      <>
        <Mermaid key="first" chart="graph TD; First-->Diagram" title="First" />
        <Mermaid key="removed" chart="graph TD; Removed-->Diagram" title="Removed" />
        <Mermaid key="last" chart="graph TD; Last-->Diagram" title="Last" />
      </>,
    );
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    rerender(
      <>
        <Mermaid key="first" chart="graph TD; First-->Diagram" title="First" />
        <Mermaid key="last" chart="graph TD; Last-->Diagram" title="Last" />
      </>,
    );
    await act(async () => pending[0].resolve({ svg: '<svg><text>First diagram</text></svg>' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(mermaid.render).toHaveBeenLastCalledWith(expect.any(String), "graph TD; Last-->Diagram");
    await act(async () => pending[1].resolve({ svg: '<svg><text>Last diagram</text></svg>' }));
    expect(screen.getByRole("img", { name: "First" })).toHaveTextContent("First diagram");
    expect(screen.getByRole("img", { name: "Last" })).toHaveTextContent("Last diagram");
    expect(screen.queryByRole("img", { name: "Removed" })).not.toBeInTheDocument();
  });
});
