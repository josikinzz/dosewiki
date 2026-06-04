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

  it("renders the active qualifier section first on qualifier routes", () => {
    render(
      <MechanismDetailPage
        detail={mechanismDetail}
        activeQualifierSlug="partial"
        drugHrefPrefix="/"
        categoryHrefPrefix="/category/"
      />,
    );

    const sections = screen.getAllByRole("heading", { level: 2 });

    expect(sections[0]).toHaveTextContent("5-HT2A receptor agonist (Partial)");
    expect(sections[1]).toHaveTextContent("5-HT2A receptor agonist (Full)");
  });
});
