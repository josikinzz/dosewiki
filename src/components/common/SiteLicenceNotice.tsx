"use client";

/**
 * The footer's reuse-rights sentence.
 *
 * This is a statement about what a reader may legally do with the material, so it has to
 * follow the publication: dose.wiki's terms are mixed — MIT code, CC0 writing, and the
 * third-party carve-outs — and it links to its in-app license page, while Effect Index
 * licenses its material under CC BY-NC-SA 4.0 and links to the Creative Commons deed.
 * Shipping either wording under the other brand would be a false claim about reuse rights.
 */
import Link from "next/link";

import { useT } from "@/i18n/client";
import {
  SITE_FLAVOR_CONFIG,
  type SiteFlavorConfig,
  type SiteLicenceNotice as SiteLicenceNoticeCopy,
} from "@/config/siteFlavor";

interface SiteLicenceNoticeProps {
  className?: string;
  /** Injected for tests; defaults to the ambient build-time flavor. */
  config?: SiteFlavorConfig;
  /**
   * Which reuse-rights line to render. Defaults to the footer's; the About page's Open
   * Data section passes its own longer wording, which states the same terms.
   */
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
      {/* Trailing copy that opens with punctuation clings to the link: "CC0: reuse it
          freely", not "CC0 : reuse it freely". Decided on the English source so the
          translation inherits the same spacing. */}
      {/^[,.;:!?)]/.test(trailing) ? null : " "}
      {t(trailing)}
    </p>
  );
}
