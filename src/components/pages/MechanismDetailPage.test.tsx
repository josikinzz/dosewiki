import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MechanismDetailPage } from "./MechanismDetailPage";
import type { MechanismDetail } from "@/data/builders/library";

const mechanismDetail = {
  definition: {
    slug: "5-ht2a-receptor-agonist",
    name: "5-HT2A receptor agonist",
    total: 2,
  },
  defaultQualifierKey: "full",
  qualifiers: [
    {
      key: "full",
      label: "Full",
      total: 1,
      groups: [],
    },
    {
      key: "partial",
      label: "Partial",
      total: 1,
      groups: [],
    },
  ],
} as MechanismDetail;

describe("MechanismDetailPage", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders only the requested qualifier while retaining sibling navigation", () => {
    render(
      <MechanismDetailPage
        detail={mechanismDetail}
        activeQualifierSlug="partial"
        drugHrefPrefix="/"
        categoryHrefPrefix="/category/"
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("5-HT2A receptor agonist (Partial)");
    expect(screen.getByRole("link", { name: /5-HT2A receptor agonist \(Full\)/ })).toHaveAttribute(
      "href", "/mechanism/5-ht2a-receptor-agonist",
    );
  });
});
