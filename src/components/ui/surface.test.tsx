import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { IconBadge } from "@/components/common/IconBadge";
import { PublicChipNav, PublicNameChip, PublicOverline, PublicPill } from "@/components/common/PublicTokens";
import { ArticleContributorAttribution } from "@/components/layout/PublicFeedbackPrimitives";
import { HarmReductionBanner } from "@/features/article/components/sections/HarmReductionBanner";
import { ReportCard } from "@/features/reports/components/ReportCard";
import { FocusedSearchResultsPage } from "@/components/pages/FocusedSearchResultsPage";
import type { SearchMatch } from "@/data/builders/search";
import type { ReportCardModel } from "@/types/tripReport";
import {
  ContentCard,
  DangerCallout,
  EmptyStateSurface,
  InteractiveContentCard,
  InteractiveSurface,
  NestedContentCard,
  StatusState,
  Surface,
} from "./surface";

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
    expect(result.className).toContain("border-[color:var(--theme-card-border-strong)]");
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

    expect(screen.getByTestId("danger").className).toContain("bg-[color:var(--theme-danger-bg)]");
    expect(screen.getByTestId("empty")).toHaveClass("theme-state-card");
    expect(screen.getByTestId("empty")).toHaveClass("text-center");
  });

  it("renders public recipe wrappers through Surface primitives", () => {
    render(
      <>
        <ContentCard data-testid="content">Content</ContentCard>
        <InteractiveContentCard data-testid="interactive">Interactive</InteractiveContentCard>
        <NestedContentCard data-testid="nested">Nested</NestedContentCard>
        <StatusState data-testid="status">Status</StatusState>
        <DangerCallout data-testid="callout">Danger</DangerCallout>
      </>,
    );

    expect(screen.getByTestId("content")).toHaveClass("theme-public-card");
    expect(screen.getByTestId("interactive")).toHaveClass("theme-public-card-interactive");
    expect(screen.getByTestId("nested")).toHaveClass("theme-public-card-subtle");
    expect(screen.getByTestId("status")).toHaveClass("theme-state-card");
    expect(screen.getByTestId("callout").className).toContain("bg-[color:var(--theme-danger-bg)]");
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
        <FocusedSearchResultsPage query="lsd" results={results} />
        <ReportCard report={report} href="/reports/sample-report" />
      </>,
    );

    expect(screen.getByText("Lysergic acid diethylamide").closest("a")).toHaveClass("theme-search-suggestion");
    expect(screen.getByRole("link", { name: /a careful evening/i })).toHaveClass("theme-public-card");
  });

  it("keeps the harm reduction banner on the danger surface", () => {
    render(
      <HarmReductionBanner
        citations={[{ label: "Erowid", href: "https://erowid.org/example" }]}
      />,
    );

    expect(screen.getByText(/disclaimer:/i).closest("section")?.className).toContain("bg-[color:var(--theme-danger-bg)]");
    expect(screen.getByRole("link", { name: /erowid/i })).toHaveAttribute(
      "href",
      "https://erowid.org/example",
    );
  });
});

describe("Public common recipes", () => {
  it("renders IconBadge tone and size variants while preserving numeric icon size compatibility", () => {
    render(
      <>
        <IconBadge icon="lucide:check" tone="success" size="sm" label="Success" />
        <IconBadge icon="lucide:alert-triangle" tone="warning" size={24} label="Legacy size" className="custom-badge" />
      </>,
    );

    expect(screen.getByText("Success").parentElement).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("Success").parentElement).toHaveAttribute("data-size", "sm");
    expect(screen.getByText("Legacy size").parentElement).toHaveClass("custom-badge");
    expect(screen.getByText("Legacy size").parentElement).toHaveAttribute("data-size", "md");
  });

  it("renders public overline, pill, name chip, and chip nav helpers with data-shaped APIs", () => {
    render(
      <>
        <PublicOverline>Section label</PublicOverline>
        <PublicPill tone="danger" icon="lucide:shield-alert">Risk</PublicPill>
        <PublicNameChip as="button" type="button" interactive>
          Visual drifting
        </PublicNameChip>
        <PublicChipNav
          items={[
            { id: "all", label: "All", active: true, count: 4 },
            { id: "reports", label: "Reports", href: "/reports", count: 2 },
          ]}
        />
      </>,
    );

    expect(screen.getByText("Section label")).toHaveClass("theme-public-overline");
    expect(screen.getByText("Risk").closest("[data-tone='danger']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visual drifting" })).toHaveAttribute(
      "data-token",
      "public-name-chip",
    );
    expect(screen.getByRole("button", { name: "Visual drifting" })).toHaveClass("theme-name-chip");
    expect(screen.getByRole("button", { name: /all4/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: /reports2/i })).toHaveAttribute("href", "/reports");
  });

  it("renders contributor attribution as an original-source badge with a separate author link", () => {
    render(
      <ArticleContributorAttribution
        author="Josie Kins"
        authorHref="/contributors/josie"
        text="Forked from Subjective Effect Documentation by Josie Kins, September 2013."
        url="https://disregardeverythingisay.com/post/60184360278/2c-b-broken-down-and-described"
      />,
    );

    expect(screen.queryByText("Original article")).not.toBeInTheDocument();
    const attributionPill = screen
      .getByText("Subjective effect documentation by")
      .closest(".theme-external-source-pill");

    expect(attributionPill).toHaveTextContent(
      "Subjective effect documentation by Josie Kins, September 2013.",
    );
    expect(attributionPill).toHaveClass("theme-external-source-pill");
    expect(screen.getByRole("link", { name: "Josie Kins" })).toHaveAttribute(
      "href",
      "/contributors/josie",
    );
    expect(
      screen.getByLabelText("Open original subjective effects documentation by Josie Kins"),
    ).toHaveAttribute(
      "href",
      "https://disregardeverythingisay.com/post/60184360278/2c-b-broken-down-and-described",
    );
  });
});
