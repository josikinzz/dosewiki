import "server-only";

import { buildMetadataDescription, type PublicPageMetadataSource } from "./publicRouteViewModels";
import type { PublicRouteIdentity } from "./publicSite";

export interface RouteMetadataSource {
  title: string;
  description: string;
  noIndex?: boolean;
}

export interface OkRouteResult<PageProps> {
  kind: "ok";
  pageProps: PageProps;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
}

export type NotFoundRouteResult = { kind: "not-found" };
export type RedirectRouteResult = {
  kind: "redirect";
  target: string;
  metadata: RouteMetadataSource;
  canonicalRoute: PublicRouteIdentity;
};

export function toRouteMetadata(metadata: PublicPageMetadataSource): RouteMetadataSource {
  return {
    title: metadata.title,
    description: buildMetadataDescription(metadata.description),
  };
}
