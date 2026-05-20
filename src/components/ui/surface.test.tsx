import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { HarmReductionBanner } from "@/features/article/components/sections/HarmReductionBanner";
import { ReportCard } from "@/features/reports/components/ReportCard";
import { SearchResultsPage } from "@/components/pages/SearchResultsPage";
import type { SearchMatch } from "@/data/builders/search";
import type { ReportCardModel } from "@/types/tripReport";
import { EmptyStateSurface, InteractiveSurface, Surface } from "./surface";

describe("Surface primitives", () => {
  it("renders the default card surface recipe", () => {
    render(<Surface data-testid="surface">Content</Surface>);

    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass("theme-card-surface");
    expect(surface).toHaveClass("rounded-2xl");
    expect(surface).toHaveClass("p-6");
  });

  it("renders semantic interactive and selected variants", () => {
    render(
      <InteractiveSurface variant="result" selected data-testid="result">
        Result
      </InteractiveSurface>,
    );

    const result = screen.getByTestId("result");
    expect(result).toHaveClass("theme-card-surface");
    expect(result).toHaveClass("group");
    expect(result.className).toContain("border-fuchsia-400/50");
  });

  it("renders danger and empty-state surfaces", () => {
    render(
      <>
        <InteractiveSurface variant="danger" data-testid="danger">
          Danger
        </InteractiveSurface>
        <EmptyStateSurface data-testid="empty">Empty</EmptyStateSurface>
      </>,
    );

    expect(screen.getByTestId("danger").className).toContain("bg-red-500/10");
    expect(screen.getByTestId("empty")).toHaveClass("theme-state-card");
    expect(screen.getByTestId("empty")).toHaveClass("text-center");
  });
});

describe("Surface primitive adapters", () => {
  it("keeps SectionCard and StateCard smoke rendering through shared surfaces", () => {
    render(
      <>
        <SectionCard id="overview">Overview</SectionCard>
        <StateCard title="No records" description="Nothing is available yet." />
      </>,
    );

    expect(screen.getByText("Overview").closest("section")).toHaveClass("theme-public-card");
    expect(screen.getByRole("heading", { name: "No records" }).closest(".theme-state-card")).toBeInTheDocument();
  });

  it("keeps representative migrated list cards rendering", () => {
    const results: SearchMatch[] = [
      {
        id: "substance:lsd",
        type: "substance",
        label: "LSD",
        secondary: "Lysergic acid diethylamide",
        slug: "lsd",
        keywords: ["lsd"],
        score: 10,
      },
    ];

    const report: ReportCardModel = {
      slug: "sample-report",
      title: "A careful evening",
      featured: true,
      subject: { name: "Ada", trip_date: "2026-04-20" },
      substances: [{ name: "LSD", dose: "100 ug", roa: "oral" }],
    };

    render(
      <>
        <SearchResultsPage query="lsd" results={results} />
        <ReportCard report={report} href="/reports/sample-report" />
      </>,
    );

    expect(screen.getByText("Lysergic acid diethylamide").closest("a")).toHaveClass("group");
    expect(screen.getByRole("link", { name: /a careful evening/i })).toHaveClass("theme-public-card");
  });

  it("keeps the harm reduction banner on the danger surface", () => {
    render(
      <HarmReductionBanner
        citations={[{ label: "Erowid", href: "https://erowid.org/example" }]}
      />,
    );

    expect(screen.getByText(/disclaimer:/i).closest("section")).toHaveClass("bg-red-500/10");
    expect(screen.getByRole("link", { name: /erowid/i })).toHaveAttribute(
      "href",
      "https://erowid.org/example",
    );
  });
});
