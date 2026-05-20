import { describe, expect, it } from "vitest";
import { createElement, isValidElement } from "react";
import {
  buildTaxonomyMetadataInput,
  buildTaxonomyPresentation,
  generateTaxonomyStaticParams,
  isTaxonomyDetailMissing,
  type TaxonomyDetailRouteDescriptor,
} from "./taxonomyDetailRoute";

function TestView(_props: Record<string, unknown>) {
  return null;
}

type Params = {
  slug: string;
};

function createDescriptor(
  detail: { label: string; total: number } | null,
): TaxonomyDetailRouteDescriptor<Params, typeof detail> {
  return {
    getDetail: async () => detail,
    getMetadata: ({ params, detail }) => ({
      title: detail?.label ?? "Fallback",
      description: detail
        ? `Browse ${detail.total} records in ${detail.label}.`
        : "Browse fallback routes.",
      route: { family: "chemicalClass", params },
    }),
    render: ({ detail }) =>
      createElement(TestView, {
        detail,
        drugHrefPrefix: "/",
      }),
  };
}

describe("taxonomy detail route module", () => {
  it("builds route metadata from descriptor detail and params", async () => {
    const metadata = await buildTaxonomyMetadataInput(
      createDescriptor({ label: "Tryptamines", total: 12 }),
      { slug: "tryptamines" },
    );

    expect(metadata).toEqual({
      title: "Tryptamines",
      description: "Browse 12 records in Tryptamines.",
      route: {
        family: "chemicalClass",
        params: { slug: "tryptamines" },
      },
    });
  });

  it("uses descriptor fallback metadata when detail is missing", async () => {
    const metadata = await buildTaxonomyMetadataInput(
      createDescriptor(null),
      { slug: "unknown" },
    );

    expect(metadata.title).toBe("Fallback");
    expect(metadata.description).toBe("Browse fallback routes.");
  });

  it("returns null presentation for missing detail before not-found handling", async () => {
    const descriptor = createDescriptor(null);

    expect(
      isTaxonomyDetailMissing(
        descriptor as TaxonomyDetailRouteDescriptor<Record<string, string>, null>,
        null,
      ),
    ).toBe(true);
    await expect(
      buildTaxonomyPresentation(descriptor, { slug: "unknown" }),
    ).resolves.toBeNull();
  });

  it("passes href policy through the presentation adapter", async () => {
    const presentation = await buildTaxonomyPresentation(
      createDescriptor({ label: "Phenethylamines", total: 7 }),
      { slug: "phenethylamines" },
    );

    expect(isValidElement(presentation)).toBe(true);
    expect(presentation).toMatchObject({
      props: { drugHrefPrefix: "/" },
    });
  });

  it("delegates static params through the descriptor", async () => {
    const descriptor = {
      ...createDescriptor({ label: "Tryptamines", total: 12 }),
      getStaticParams: async () => [{ slug: "tryptamines" }],
    };

    await expect(generateTaxonomyStaticParams(descriptor)).resolves.toEqual([
      { slug: "tryptamines" },
    ]);
  });

  it("supports specialized missing rules for effect categories", async () => {
    const descriptor: TaxonomyDetailRouteDescriptor<Params, unknown[]> = {
      getDetail: async () => [],
      isMissing: (effects) => effects.length === 0,
      getMetadata: ({ params, detail }) => ({
        title: `Effect category · ${params.slug}`,
        description: `Browse ${detail.length} effects in the ${params.slug} category.`,
        route: { family: "effectCategory", params: { categorySlug: params.slug } },
      }),
      render: ({ params, detail }) =>
        createElement(TestView, {
          categorySlug: params.slug,
          effects: detail,
          effectHrefPrefix: "/effects/",
          backHref: "/effects",
        }),
    };

    await expect(
      buildTaxonomyPresentation(descriptor, { slug: "visual" }),
    ).resolves.toBeNull();

    const metadata = await buildTaxonomyMetadataInput(descriptor, {
      slug: "visual",
    });
    expect(metadata.description).toBe("Browse 0 effects in the visual category.");
  });

  it("supports nested mechanism qualifier adapters", async () => {
    type QualifierParams = {
      mechanismSlug: string;
      qualifierSlug: string;
    };
    type QualifierDetail = {
      mechanismName: string | null;
      qualifier?: { key: string; label: string; total: number };
    };
    const descriptor: TaxonomyDetailRouteDescriptor<
      QualifierParams,
      QualifierDetail
    > = {
      getDetail: async ({ qualifierSlug }) => ({
        mechanismName: "Serotonin",
        qualifier:
          qualifierSlug === "agonist"
            ? { key: "agonist", label: "Agonist", total: 3 }
            : undefined,
      }),
      isMissing: (detail) => !detail.mechanismName || !detail.qualifier,
      getMetadata: ({ params, detail }) => ({
        title: detail.qualifier
          ? `${detail.mechanismName} · ${detail.qualifier.label}`
          : "Mechanism qualifier",
        description: detail.qualifier
          ? `Browse ${detail.qualifier.total} substances in the ${detail.qualifier.label} qualifier.`
          : "Browse mechanism qualifier routes.",
        route: { family: "mechanismQualifier", params },
      }),
      render: ({ params, detail }) =>
        createElement(TestView, {
          activeQualifierSlug: params.qualifierSlug,
          qualifier: detail.qualifier,
          drugHrefPrefix: "/",
          categoryHrefPrefix: "/category/",
        }),
    };

    const metadata = await buildTaxonomyMetadataInput(descriptor, {
      mechanismSlug: "serotonin",
      qualifierSlug: "agonist",
    });
    expect(metadata.title).toBe("Serotonin · Agonist");

    const presentation = await buildTaxonomyPresentation(descriptor, {
      mechanismSlug: "serotonin",
      qualifierSlug: "agonist",
    });
    expect(presentation).toMatchObject({
      props: {
        activeQualifierSlug: "agonist",
        drugHrefPrefix: "/",
        categoryHrefPrefix: "/category/",
      },
    });

    await expect(
      buildTaxonomyPresentation(descriptor, {
        mechanismSlug: "serotonin",
        qualifierSlug: "missing",
      }),
    ).resolves.toBeNull();
  });
});
