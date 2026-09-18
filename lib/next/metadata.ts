import type { Metadata } from "next";
import { buildPublicPageMetadata } from "./publicSite";

type MetadataInput = {
  title: string;
  description: string;
  pathname: string;
  noIndex?: boolean;
};

export function buildPageMetadata({ title, description, pathname, noIndex = false }: MetadataInput): Metadata {
  return buildPublicPageMetadata({ title, description, pathname, noIndex });
}
