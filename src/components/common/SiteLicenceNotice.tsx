"use client";

import Link from "next/link";

import { useT } from "@/i18n/client";
import {
  SITE_FLAVOR_CONFIG,
  type SiteFlavorConfig,
  type SiteLicenceNotice as SiteLicenceNoticeCopy,
} from "@/config/siteFlavor";

interface SiteLicenceNoticeProps {
  className?: string;
  config?: SiteFlavorConfig;
  notice?: SiteLicenceNoticeCopy;
}

const LINK_CLASS_NAME = "theme-link-muted transition-colors";

export function SiteLicenceNotice({
  className = "theme-text-faint text-xs leading-5",
  config = SITE_FLAVOR_CONFIG,
  notice,
}: SiteLicenceNoticeProps) {
  const t = useT();
  const { leadIn, linkHref, linkIsExternal, linkLabel, trailing } =
    notice ?? config.footer.licence;

  return (
    <p className={className}>
      {t(leadIn)}{" "}
      {linkIsExternal ? (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer license"
          className={LINK_CLASS_NAME}
        >
          {t(linkLabel)}
        </a>
      ) : (
        <Link href={linkHref} scroll={false} className={LINK_CLASS_NAME}>
          {t(linkLabel)}
        </Link>
      )}
      {/^[,.;:!?)]/.test(trailing) ? null : " "}
      {t(trailing)}
    </p>
  );
}
