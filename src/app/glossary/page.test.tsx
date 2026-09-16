import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { buildGlossaryGroups, GlossaryPage as GlossaryContentPage } from "@/components/pages/GlossaryPage";

const mocks = vi.hoisted(() => ({
  getDataBackend: vi.fn<() => "postgres">(() => "postgres"),
  readGlosses: vi.fn(),
}));

vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: mocks.getDataBackend,
}));
vi.mock("@server/translation/glossaryGloss", () => ({
  readGlosses: mocks.readGlosses,
}));
vi.mock("@server/translation/glossary", () => ({
  readGlossaryRows: vi.fn(),
}));

import GlossaryPage, { generateMetadata } from "./page";
import { generateMetadata as generateMirrorMetadata } from "../zh/glossary/page";

const gloss = (term: string, kind: string, text: string) => ({
  term,
  kind,
  gloss: text,
  updated_at: 1,
  updated_by: null,
});

beforeEach(() => {
  mocks.getDataBackend.mockReturnValue("postgres");
  mocks.readGlosses.mockReset();
});

describe("/glossary", () => {
  it("groups terms by kind, sorts within a category, and keeps unrecognized kinds visible", async () => {
    mocks.readGlosses.mockResolvedValue([
      gloss("Offset", "enum:duration-stage", "Duration stage 4 of 6: effects declining"),
      gloss("Marquis", "reagent-name", "Reagent test named for a person"),
      gloss("Euphoria", "effect-name", "A pleasurable state"),
      gloss("Auditory hallucination", "effect-name", "Hearing sounds with no source"),
      gloss("Mystery", "kind-nobody-names", "Filed under Other"),
    ]);

    render(await GlossaryPage());

    const effects = document.getElementById("effects");
    expect(effects).not.toBeNull();
    const effectTerms = within(effects as HTMLElement)
      .getAllByRole("term")
      .map((node) => node.textContent);
    expect(effectTerms).toEqual(["Auditory hallucination", "Euphoria"]);

    const offset = screen.getByText("Offset").closest("div");
    expect(offset).toHaveTextContent("Duration stage 4 of 6: effects declining");
    expect(screen.getByText("Filed under Other").closest("div")).toHaveTextContent("kind-nobody-names");
    expect(screen.queryByText("No glossary entries yet")).not.toBeInTheDocument();
  });

  it("renders the empty state when no gloss is stored yet", async () => {
    mocks.readGlosses.mockResolvedValue([]);

    render(await GlossaryPage());

    expect(screen.getByText("No glossary entries yet")).toBeInTheDocument();
  });

  it("publishes an indexable canonical address", async () => {
    const metadata = await generateMetadata();

    expect(metadata.alternates?.canonical).toBe(`${SITE_FLAVOR_CONFIG.launchSiteUrl}/glossary`);
    expect(metadata.robots).toBeUndefined();
  });
});

describe("zh mirror of /glossary", () => {
  it("keeps a term's rendering distinct from its English reader definition and includes terms without definitions", () => {
    const definition = "Duration stage 4 of 6";
    const glosses = [gloss("Offset", "enum:duration-stage", definition)];
    const renderings = [
      { term: "Offset", target: "Fixture translated term", kind: "enum:duration-stage" },
      { term: "Marquis", target: "Fixture reagent term", kind: "reagent-name" },
    ];

    render(
      <GlossaryContentPage
        groups={buildGlossaryGroups(glosses, renderings)}
        renderingLang="zh-Hans"
      />,
    );

    const offsetTerm = screen.getByText("Offset").closest("dt");
    expect(within(offsetTerm as HTMLElement).getByText(renderings[0].target)).toHaveAttribute("lang", "zh-Hans");
    expect(screen.getByText(definition)).toHaveAttribute("lang", "en");
    expect(offsetTerm?.closest("div")).toHaveTextContent(definition);
    expect(glosses[0].gloss).toBe(definition);

    const marquisRow = screen.getByText("Marquis").closest("div");
    expect(marquisRow).toHaveTextContent(renderings[1].target);
    expect(within(marquisRow as HTMLElement).queryByText(definition)).not.toBeInTheDocument();
  });

  it("is a noindex mirror with the English canonical", async () => {
    const metadata = await generateMirrorMetadata();

    expect(metadata.alternates?.canonical).toBe(`${SITE_FLAVOR_CONFIG.launchSiteUrl}/glossary`);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
