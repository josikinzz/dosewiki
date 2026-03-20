import type { Metadata } from "next";

type MetadataInput = {
  title: string;
  description: string;
  pathname: string;
  noIndex?: boolean;
};

const SITE_NAME = "dose.wiki";
const SITE_URL = "https://dose.wiki";

export function buildPageMetadata({ title, description, pathname, noIndex = false }: MetadataInput): Metadata {
  const absoluteUrl = new URL(pathname, SITE_URL).toString();

  return {
    title,
    description,
    alternates: {
      canonical: pathname,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl,
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: "/icon-512.png",
          width: 512,
          height: 512,
          alt: `${SITE_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/icon-512.png"],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
  };
}
