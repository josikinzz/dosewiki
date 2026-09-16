import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlossaryUsageDisclosure } from "./GlossaryUsageDisclosure";

const source = {
  term: "Taking Off",
  nodes: [{ id: "dmt:stage", href: "/dmt#subjective-effects", title: "DMT", context: "Subjective Effects > 1. Taking Off", kind: "label" }],
  totalSourceNodes: 1,
  nextOffset: null,
  coverage: "Source locations, not pages. Partial source coverage.",
};

afterEach(() => vi.unstubAllGlobals());

describe("GlossaryUsageDisclosure", () => {
  it("does not fetch until expanded and retains accessible results across collapse", async () => {
    const fetcher = vi.fn(async () => Response.json(source));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<GlossaryUsageDisclosure term="Taking Off" />);
    expect(fetcher).not.toHaveBeenCalled();
    const control = screen.getByRole("button", { name: "Where it is used: Taking Off" });
    expect(control).toHaveAttribute("aria-expanded", "false");
    await user.click(control);
    const link = await screen.findByRole("link", { name: "DMT" });
    expect(link).toHaveAttribute("href", "/dmt#subjective-effects");
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(control.getAttribute("aria-controls")!)).toContainElement(link);
    await user.click(control);
    expect(screen.queryByRole("link", { name: "DMT" })).not.toBeInTheDocument();
    await user.click(control);
    expect(screen.getByRole("link", { name: "DMT" })).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps only three links visible until expanded and restores the compact view on reopen", async () => {
    const fetcher = vi.fn(async () => Response.json({
      ...source,
      nodes: ["DMT", "LSD", "Psilocybin", "Mescaline"].map((title) => ({
        ...source.nodes[0], id: title, title, href: `/${title.toLowerCase()}`,
      })),
      totalSourceNodes: 4,
    }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<GlossaryUsageDisclosure term="Taking Off" />);
    const control = screen.getByRole("button", { name: "Where it is used: Taking Off" });
    await user.click(control);
    await screen.findByRole("link", { name: "DMT" });
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Mescaline" })).not.toBeInTheDocument();

    const more = screen.getByRole("button", { name: "More source links: Taking Off" });
    await user.click(more);
    expect(screen.getByRole("link", { name: "Mescaline" })).toHaveAttribute("href", "/mescaline");
    await user.click(more);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    await user.click(more);
    await user.click(control);
    await user.click(control);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports failed lookup rather than claiming no use, and retries the request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ...source, nodes: [], totalSourceNodes: 0 }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<GlossaryUsageDisclosure term="Taking Off" />);
    await user.click(screen.getByRole("button", { name: "Where it is used: Taking Off" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Usage sources could not be loaded.");
    expect(screen.queryByText("No matching source locations in the covered sources.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("No matching source locations in the covered sources.")).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
