import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  buildPublicPageMetadata,
  type PublicPageMetadataInput,
} from "./publicSite";

export type TaxonomyRouteParams = Record<string, string>;

export type TaxonomyMetadataInput<TParams extends TaxonomyRouteParams, TDetail> = {
  params: TParams;
  detail: TDetail;
};

export type TaxonomyPresentationInput<TParams extends TaxonomyRouteParams, TDetail> = {
  params: TParams;
  detail: NonNullable<TDetail>;
};

export type TaxonomyDetailRouteDescriptor<
  TParams extends TaxonomyRouteParams,
  TDetail,
> = {
  getStaticParams?: () => Promise<TParams[]>;
  getDetail: (params: TParams) => Promise<TDetail>;
  getMetadata: (
    input: TaxonomyMetadataInput<TParams, TDetail>,
  ) => PublicPageMetadataInput;
  isMissing?: (detail: TDetail) => boolean;
  render: (
    input: TaxonomyPresentationInput<TParams, TDetail>,
  ) => ReactNode | Promise<ReactNode>;
};

export type TaxonomyRoutePageProps<TParams extends TaxonomyRouteParams> = {
  params: Promise<TParams>;
};

export async function resolveTaxonomyParams<TParams extends TaxonomyRouteParams>(
  params: Promise<TParams>,
) {
  return await params;
}

export async function buildTaxonomyMetadataInput<
  TParams extends TaxonomyRouteParams,
  TDetail,
>(
  descriptor: TaxonomyDetailRouteDescriptor<TParams, TDetail>,
  params: TParams,
) {
  const detail = await descriptor.getDetail(params);
  return descriptor.getMetadata({ params, detail });
}

export async function generateTaxonomyMetadata<
  TParams extends TaxonomyRouteParams,
  TDetail,
>(
  descriptor: TaxonomyDetailRouteDescriptor<TParams, TDetail>,
  props: TaxonomyRoutePageProps<TParams>,
): Promise<Metadata> {
  const params = await resolveTaxonomyParams(props.params);
  return buildPublicPageMetadata(
    await buildTaxonomyMetadataInput(descriptor, params),
  );
}

export async function generateTaxonomyStaticParams<
  TParams extends TaxonomyRouteParams,
  TDetail,
>(descriptor: TaxonomyDetailRouteDescriptor<TParams, TDetail>) {
  return descriptor.getStaticParams ? await descriptor.getStaticParams() : [];
}

export function isTaxonomyDetailMissing<TDetail>(
  descriptor: TaxonomyDetailRouteDescriptor<TaxonomyRouteParams, TDetail>,
  detail: TDetail,
) {
  return descriptor.isMissing ? descriptor.isMissing(detail) : detail == null;
}

export async function buildTaxonomyPresentation<
  TParams extends TaxonomyRouteParams,
  TDetail,
>(
  descriptor: TaxonomyDetailRouteDescriptor<TParams, TDetail>,
  params: TParams,
) {
  const detail = await descriptor.getDetail(params);

  if (
    isTaxonomyDetailMissing(
      descriptor as TaxonomyDetailRouteDescriptor<TaxonomyRouteParams, TDetail>,
      detail,
    )
  ) {
    return null;
  }

  return await descriptor.render({
    params,
    detail: detail as NonNullable<TDetail>,
  });
}

export async function renderTaxonomyDetailPage<
  TParams extends TaxonomyRouteParams,
  TDetail,
>(
  descriptor: TaxonomyDetailRouteDescriptor<TParams, TDetail>,
  props: TaxonomyRoutePageProps<TParams>,
) {
  const params = await resolveTaxonomyParams(props.params);
  const presentation = await buildTaxonomyPresentation(descriptor, params);

  if (presentation == null) {
    notFound();
  }

  return presentation;
}
