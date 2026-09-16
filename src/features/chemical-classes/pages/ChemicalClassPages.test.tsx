import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UiLocaleProvider } from "@/i18n/client";
import type { ChemicalClassDetail, ChemicalClassTreePayload } from "../types";
import { ChemicalClassDetailPage } from "./ChemicalClassDetailPage";
import { ChemicalClassTreePage } from "./ChemicalClassTreePage";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSelectedLayoutSegments: () => [],
}));


vi.mock("@/components/pages/MoleculeImage", () => ({
  MoleculeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const description =
  "Substituted phenethylamines are a chemical class of organic compounds derived from the core phenethylamine structure. Phenethylamines are derived from a phenyl ring that is joined to an amino group via a two-carbon ethyl sidechain. Members of the class are produced by adding substituents to the aromatic ring, to the sidechain carbons, or to the amine nitrogen. Most substituted phenethylamines are psychoactive substances which behave across a wide range of categories, including stimulants, hallucinogens and entactogens. Many endogenous compounds, including catecholamines such as dopamine and noradrenaline, are phenethylamines.";

const detail: ChemicalClassDetail = {
  key: "phenethylamine",
  label: "Phenethylamine",
  icon: "lucide:hexagon",
  total: 1,
  description,
  molecules: [{ slug: "2c-b", name: "2C-B", url: "/2c-b.svg" }],
  panels: [
    {
      key: "psychedelic",
      name: "Psychedelic",
      icon: "game-icons:oily-spiral",
      total: 1,
      drugs: [{ slug: "2c-b", name: "2C-B" }],
    },
  ],
  lineage: [{ key: "phenethylamine", label: "Phenethylamine", rolledTotal: 1 }],
  bioisosteres: [],
  children: [],
  otherParents: [],
  structureUrl: "/phenethylamine.svg",
};

const tree: ChemicalClassTreePayload = {
  roots: ["phenethylamine"],
  nodes: {
    phenethylamine: {
      key: "phenethylamine",
      label: "Phenethylamine",
      directTotal: 1,
      rolledTotal: 1,
      children: [],
      parents: [],
    },
  },
};

function renderInChinese(children: ReactNode) {
  return render(<UiLocaleProvider locale="zh-Hans">{children}</UiLocaleProvider>);
}

describe("chemical class locale rendering", () => {
  it("retains canonical class links on the mirror", () => {
    renderInChinese(<ChemicalClassTreePage payload={tree} />);

    expect(screen.getByRole("link", { name: /Phenethylamine/ })).toHaveAttribute("href", "/chemical-classes/phenethylamine");
  });

  it("keeps compound identifiers and canonical destinations on the mirror", () => {
    renderInChinese(<ChemicalClassDetailPage detail={detail} />);

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toContain(
      "/chemical-classes",
    );
    expect(screen.getByRole("link", { name: /2C-B/ })).toHaveAttribute("href", "/2c-b");
  });
});
