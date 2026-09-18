import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { IconBadge } from "@/components/common/IconBadge";
import { PublicChipNav, PublicNameChip, PublicOverline, PublicPill } from "@/components/common/PublicTokens";
import { ArticleContributorAttribution } from "@/components/layout/PublicFeedbackPrimitives";
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
  it("renders content and forwards element attributes", () => {
    render(
      <Surface role="region" aria-label="Overview" id="overview">
        Content
      </Surface>,
    );

    const surface = screen.getByRole("region", { name: "Overview" });
    expect(surface).toHaveAttribute("id", "overview");
    expect(surface).toHaveTextContent("Content");
  });

  it("composes onto its child element with asChild instead of wrapping it", () => {
    const { container } = render(
      <Surface asChild>
        <a href="/reports">Reports</a>
      </Surface>,
    );

    const link = screen.getByRole("link", { name: "Reports" });
    expect(link).toHaveAttribute("href", "/reports");
    expect(link.parentElement).toBe(container);
  });

  it("keeps a consumer className alongside the recipe", () => {
    render(<Surface className="consumer-hook">Content</Surface>);

    expect(screen.getByText("Content")).toHaveClass("consumer-hook");
  });

  it("renders every recipe wrapper with its content and semantics intact", () => {
    render(
      <>
        <ContentCard>Content</ContentCard>
        <InteractiveContentCard role="button" tabIndex={0} aria-label="Open interactive">
          Interactive
        </InteractiveContentCard>
        <InteractiveSurface variant="result" selected role="option" aria-selected>
          Result
        </InteractiveSurface>
        <NestedContentCard>Nested</NestedContentCard>
        <StatusState role="status">Status</StatusState>
        <EmptyStateSurface tone="danger" role="status">
          Empty
        </EmptyStateSurface>
        <DangerCallout role="alert">Danger</DangerCallout>
      </>,
    );

    expect(screen.getByText("Content")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open interactive" })).toHaveTextContent("Interactive");
    expect(screen.getByRole("option", { name: "Result" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Nested")).toBeVisible();
    expect(screen.getAllByRole("status").map((node) => node.textContent)).toEqual([
      "Status",
      "Empty",
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent("Danger");
  });
});

describe("Surface primitive adapters", () => {
  it("keeps SectionCard and StateCard rendering their content through shared surfaces", () => {
    const { container } = render(
      <>
        <SectionCard id="overview">Overview</SectionCard>
        <StateCard title="No records" description="Nothing is available yet." />
      </>,
    );

    expect(container.querySelector("section#overview")).toHaveTextContent("Overview");
    expect(screen.getByRole("heading", { name: "No records" })).toBeVisible();
    expect(screen.getByText("Nothing is available yet.")).toBeVisible();
  });

  it("keeps representative migrated list cards rendering as links", () => {
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

    const resultLink = screen.getByText("Lysergic acid diethylamide").closest("a");
    expect(resultLink).toHaveAttribute("href", "/lsd");
    expect(resultLink).toHaveTextContent("LSD");
    expect(screen.getByRole("link", { name: /a careful evening/i })).toHaveAttribute(
      "href",
      "/reports/sample-report",
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

    const success = screen.getByText("Success").parentElement;
    expect(success).toHaveAttribute("data-tone", "success");
    expect(success).toHaveAttribute("data-size", "sm");

    const legacy = screen.getByText("Legacy size").parentElement;
    expect(legacy).toHaveClass("custom-badge");
    expect(legacy).toHaveAttribute("data-size", "md");
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

    expect(screen.getByText("Section label")).toBeVisible();
    expect(screen.getByText("Risk").closest("[data-tone='danger']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visual drifting" })).toHaveAttribute(
      "data-token",
      "public-name-chip",
    );
    expect(screen.getByRole("button", { name: /all4/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: /reports2/i })).toHaveAttribute("href", "/reports");
  });

  it("renders contributor attribution as an original-source badge with a separate author link", () => {
    render(
      <ArticleContributorAttribution
        author="Josie Kins"
        authorHref="/contributors/josie"
        text="Forked from Subjective Effect Documentation work by Josie Kins, September 2013."
        url="https://disregardeverythingisay.com/post/60184360278/2c-b-broken-down-and-described"
      />,
    );

    expect(screen.queryByText("Original article")).not.toBeInTheDocument();
    // The pill's overlay link carries the accessible name; the credit text
    // sits beside it inside the same pill.
    const attribution = screen.getByLabelText(
      "Open original subjective effects documentation by Josie Kins",
    ).parentElement;

    expect(attribution).toHaveTextContent("Forked from Subjective Effect Documentation work");
    expect(attribution).toHaveTextContent("by");
    expect(attribution).toHaveTextContent("Josie Kins");
    expect(attribution).toHaveTextContent("September 2013.");
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
